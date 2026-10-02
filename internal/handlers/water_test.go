package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"cals/internal/auth"
	"cals/internal/database"
)

func authedRequest(t *testing.T, method, target, body, email string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return req.WithContext(context.WithValue(req.Context(), auth.UserEmailKey, email))
}

func insertDrink(t *testing.T, userID int64, name, icon string, volume, calories int, water bool) int64 {
	t.Helper()
	result, err := database.DB.Exec(`
		INSERT INTO drinks (user_id, name, icon, volume_ml, calories, counts_toward_water)
		VALUES (?, ?, ?, ?, ?, ?)
	`, userID, name, icon, volume, calories, water)
	if err != nil {
		t.Fatalf("inserting drink %s: %v", name, err)
	}
	id, _ := result.LastInsertId()
	return id
}

func getWater(t *testing.T, email, date string) WaterResponse {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetWater(recorder, authedRequest(t, http.MethodGet, "/api/water?date="+date, "", email))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/water status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response WaterResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decoding water response: %v", err)
	}
	return response
}

// Water has one source of truth: drink entries whose drink is flagged. A drink
// that is not flagged must not contribute, and vice versa.
func TestWaterTotalsOnlyFlaggedDrinkEntries(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	_, _ = database.DB.Exec(`UPDATE users SET daily_water_goal_ml = 2500 WHERE id = ?`, userID)

	water := insertDrink(t, userID, "Water", "💧", 250, 0, true)
	coffee := insertDrink(t, userID, "Coffee", "☕", 300, 20, false)

	for _, insert := range []struct {
		drinkID  int64
		volume   int
		calories int
	}{
		{water, 250, 0},
		{water, 500, 0},
		{coffee, 300, 20},
	} {
		if _, err := database.DB.Exec(`
			INSERT INTO drink_entries (user_id, drink_id, date, volume_ml, calories)
			VALUES (?, ?, '2026-09-29', ?, ?)
		`, userID, insert.drinkID, insert.volume, insert.calories); err != nil {
			t.Fatalf("inserting drink entry: %v", err)
		}
	}

	response := getWater(t, "wife@example.com", "2026-09-29")
	if response.ConsumedML != 750 {
		t.Errorf("ConsumedML = %d, want 750 (only the flagged drink)", response.ConsumedML)
	}
	if response.TargetML != 2500 {
		t.Errorf("TargetML = %d, want the user's 2500", response.TargetML)
	}
	if len(response.Entries) != 2 {
		t.Errorf("len(Entries) = %d, want 2", len(response.Entries))
	}

	// The coffee is not water and must be absent from another day's view.
	empty := getWater(t, "wife@example.com", "2026-09-30")
	if empty.ConsumedML != 0 || len(empty.Entries) != 0 {
		t.Errorf("water on a day with nothing logged = %+v, want zero", empty)
	}
	if empty.Entries == nil {
		t.Error("Entries should encode as [] rather than null")
	}
}

func TestAddDrinkEntryUsesVolumeOverrideAndScalesCalories(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	milk := insertDrink(t, userID, "Milk", "🥛", 200, 100, false)

	// A 500 ml serving rather than the drink's typical 200 ml: 100 kcal per
	// 200 ml scales to 250 kcal.
	recorder := httptest.NewRecorder()
	HandleAddDrinkEntry(recorder, authedRequest(t, http.MethodPost, "/api/drinks/entries",
		`{"drink_id":`+itoa(milk)+`,"date":"2026-09-29","volume_ml":500}`, "husband@example.com"))

	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var entry DrinkEntry
	if err := json.NewDecoder(recorder.Body).Decode(&entry); err != nil {
		t.Fatalf("decoding entry: %v", err)
	}
	if entry.VolumeML != 500 {
		t.Errorf("VolumeML = %d, want 500", entry.VolumeML)
	}
	if entry.Calories != 250 {
		t.Errorf("Calories = %d, want 250 (scaled from 100 kcal per 200 ml)", entry.Calories)
	}

	// Without an override the drink's own values are snapshot.
	recorder = httptest.NewRecorder()
	HandleAddDrinkEntry(recorder, authedRequest(t, http.MethodPost, "/api/drinks/entries",
		`{"drink_id":`+itoa(milk)+`,"date":"2026-09-29"}`, "husband@example.com"))
	if err := json.NewDecoder(recorder.Body).Decode(&entry); err != nil {
		t.Fatalf("decoding entry: %v", err)
	}
	if entry.VolumeML != 200 || entry.Calories != 100 {
		t.Errorf("entry = %+v, want the drink's 200 ml / 100 kcal", entry)
	}
}

func TestAddDrinkEntryRejectsAnotherUsersDrink(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	otherID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	herDrink := insertDrink(t, otherID, "Wine", "🍷", 175, 130, false)

	recorder := httptest.NewRecorder()
	HandleAddDrinkEntry(recorder, authedRequest(t, http.MethodPost, "/api/drinks/entries",
		`{"drink_id":`+itoa(herDrink)+`,"date":"2026-09-29"}`, "husband@example.com"))

	if recorder.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404 for a drink the user does not own", recorder.Code)
	}
	var count int
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM drink_entries`).Scan(&count)
	if count != 0 {
		t.Errorf("drink_entries count = %d, want 0", count)
	}
}

// The quick selector must use the user's own drinks; no generic presets are
// created on their behalf (product decision 8).
func TestGetDrinksDoesNotCreateDefaults(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "fresh@example.com", "2026-09-28", 2000)

	recorder := httptest.NewRecorder()
	HandleGetDrinks(recorder, authedRequest(t, http.MethodGet, "/api/drinks", "", "fresh@example.com"))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d", recorder.Code)
	}
	var drinks []Drink
	if err := json.NewDecoder(recorder.Body).Decode(&drinks); err != nil {
		t.Fatalf("decoding drinks: %v", err)
	}
	if len(drinks) != 0 {
		t.Errorf("drinks = %+v, want none (no auto-created defaults)", drinks)
	}

	var count int
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM drinks`).Scan(&count)
	if count != 0 {
		t.Errorf("drinks in database = %d, want 0", count)
	}
}

func TestDrinkWaterFlagRoundTrips(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	recorder := httptest.NewRecorder()
	HandleCreateDrink(recorder, authedRequest(t, http.MethodPost, "/api/drinks",
		`{"name":"Squash","icon":"🥤","volume_ml":250,"calories":5,"counts_toward_water":true}`, "wife@example.com"))
	if recorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var created Drink
	if err := json.NewDecoder(recorder.Body).Decode(&created); err != nil {
		t.Fatalf("decoding created drink: %v", err)
	}
	if !created.CountsTowardWater {
		t.Error("created drink should count towards water")
	}

	// Read through the API as well, to cover the list path.
	recorder = httptest.NewRecorder()
	HandleGetDrinks(recorder, authedRequest(t, http.MethodGet, "/api/drinks", "", "wife@example.com"))
	var drinks []Drink
	_ = json.NewDecoder(recorder.Body).Decode(&drinks)
	if len(drinks) != 1 || !drinks[0].CountsTowardWater {
		t.Errorf("drinks = %+v, want one water-counting drink", drinks)
	}
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}
