package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestCreateDrinkExtrasRoundTrip(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	recorder := httptest.NewRecorder()
	HandleCreateDrink(recorder, authedRequest(t, http.MethodPost, "/api/drinks",
		`{"name":"Tea","icon":"🫖","volume_ml":250,"calories":17,"counts_toward_water":true,"accepts_milk":true,"accepts_sugar":true,"usual_milk":true,"usual_sugar":"1","sort_order":2}`,
		"wife@example.com"))
	if recorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var created Drink
	if err := json.NewDecoder(recorder.Body).Decode(&created); err != nil {
		t.Fatalf("decoding created drink: %v", err)
	}
	if !created.AcceptsMilk || !created.AcceptsSugar || !created.UsualMilk || created.UsualSugar != "1" || created.SortOrder != 2 {
		t.Errorf("created extras = %+v", created)
	}

	recorder = httptest.NewRecorder()
	HandleGetDrinks(recorder, authedRequest(t, http.MethodGet, "/api/drinks", "", "wife@example.com"))
	var drinks []Drink
	if err := json.NewDecoder(recorder.Body).Decode(&drinks); err != nil {
		t.Fatalf("decoding drinks: %v", err)
	}
	if len(drinks) != 1 {
		t.Fatalf("drinks len = %d, want 1", len(drinks))
	}
	got := drinks[0]
	if !got.AcceptsMilk || !got.UsualMilk || got.UsualSugar != "1" || got.SortOrder != 2 {
		t.Errorf("listed extras = %+v", got)
	}
}

func TestAddDrinkEntryCaloriesOverride(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	tea := insertDrink(t, userID, "Tea", "🫖", 250, 17, true)

	recorder := httptest.NewRecorder()
	HandleAddDrinkEntry(recorder, authedRequest(t, http.MethodPost, "/api/drinks/entries",
		`{"drink_id":`+itoa(tea)+`,"date":"2026-09-29","calories":33}`, "husband@example.com"))
	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var entry DrinkEntry
	if err := json.NewDecoder(recorder.Body).Decode(&entry); err != nil {
		t.Fatalf("decoding entry: %v", err)
	}
	if entry.Calories != 33 {
		t.Errorf("Calories = %d, want 33 (vary-this-time override)", entry.Calories)
	}
	if entry.VolumeML != 250 {
		t.Errorf("VolumeML = %d, want the drink's 250", entry.VolumeML)
	}
}

func TestAddDrinkEntryRejectsNegativeCalories(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	tea := insertDrink(t, userID, "Tea", "🫖", 250, 17, true)

	recorder := httptest.NewRecorder()
	HandleAddDrinkEntry(recorder, authedRequest(t, http.MethodPost, "/api/drinks/entries",
		`{"drink_id":`+itoa(tea)+`,"date":"2026-09-29","calories":-1}`, "husband@example.com"))
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", recorder.Code)
	}
}
