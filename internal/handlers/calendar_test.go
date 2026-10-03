package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"cals/internal/auth"
	"cals/internal/database"
)

// getCalendarRange calls GET /api/calendar for the given inclusive range.
func getCalendarRange(t *testing.T, email, from, to string) calendarResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/calendar?from="+from+"&to="+to, nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.UserEmailKey, email))
	recorder := httptest.NewRecorder()

	HandleGetCalendar(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/calendar status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response calendarResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decoding calendar response: %v", err)
	}
	return response
}

func calendarDay(t *testing.T, response calendarResponse, date string) CalendarDay {
	t.Helper()
	for _, d := range response.Days {
		if d.Date == date {
			return d
		}
	}
	t.Fatalf("calendar response has no day %s", date)
	return CalendarDay{}
}

// createCalendarDrink inserts a drink for the user and returns its id.
func createCalendarDrink(t *testing.T, userID int64, name string, countsTowardWater int) int64 {
	t.Helper()
	result, err := database.DB.Exec(`
		INSERT INTO drinks (user_id, name, icon, volume_ml, calories, counts_toward_water)
		VALUES (?, ?, '🥤', 500, 0, ?)
	`, userID, name, countsTowardWater)
	if err != nil {
		t.Fatalf("inserting drink: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("drink id: %v", err)
	}
	return id
}

// Regression test for the calendar showing "0 / goal kcal" on every day.
//
// `date` columns are declared DATE, so mattn/go-sqlite3 hands them back as
// time.Time and they scan into a string as "2026-09-29T00:00:00Z". The first
// implementation keyed its per-day map on that raw value, so no row ever
// matched a YYYY-MM-DD key and every day came back empty.
func TestCalendarReportsPerDayTotals(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUser(t, "owner@example.com", "2026-09-28", 1500)
	foodID := createTestFood(t)

	for _, entry := range []struct {
		meal string
		kcal int
	}{{"breakfast", 400}, {"dinner", 600}} {
		if _, err := database.DB.Exec(`
			INSERT INTO diary_entries (user_id, date, meal, food_id, quantity_grams, calories)
			VALUES (?, '2026-09-29', ?, ?, 100, ?)
		`, userID, entry.meal, foodID, entry.kcal); err != nil {
			t.Fatalf("inserting diary entry: %v", err)
		}
	}

	wine := createCalendarDrink(t, userID, "Wine", 0)
	if _, err := database.DB.Exec(`
		INSERT INTO drink_entries (user_id, drink_id, date, volume_ml, calories)
		VALUES (?, ?, '2026-09-29', 175, 130)
	`, userID, wine); err != nil {
		t.Fatalf("inserting drink entry: %v", err)
	}

	water := createCalendarDrink(t, userID, "Water", 1)
	if _, err := database.DB.Exec(`
		INSERT INTO drink_entries (user_id, drink_id, date, volume_ml, calories)
		VALUES (?, ?, '2026-09-29', 500, 0)
	`, userID, water); err != nil {
		t.Fatalf("inserting drink entry: %v", err)
	}

	response := getCalendarRange(t, "owner@example.com", "2026-09-28", "2026-09-30")
	day := calendarDay(t, response, "2026-09-29")

	if day.FoodCalories != 1000 {
		t.Errorf("FoodCalories = %v, want 1000", day.FoodCalories)
	}
	if day.DrinkCalories != 130 {
		t.Errorf("DrinkCalories = %v, want 130", day.DrinkCalories)
	}
	if day.Calories != 1130 {
		t.Errorf("Calories = %v, want 1130", day.Calories)
	}
	if day.Meals["breakfast"] != 400 || day.Meals["dinner"] != 600 {
		t.Errorf("Meals = %v, want breakfast 400 and dinner 600", day.Meals)
	}
	if day.HydrationMl != 500 {
		t.Errorf("HydrationMl = %d, want 500", day.HydrationMl)
	}
	if !day.HasData {
		t.Error("HasData = false, want true for a day with entries")
	}

	// Two completed days (28th, 29th) at 1500 = 3000 budget, 1130 consumed.
	if day.BankBalance != 1870 {
		t.Errorf("BankBalance = %d, want 1870", day.BankBalance)
	}

	empty := calendarDay(t, response, "2026-09-28")
	if empty.Calories != 0 || empty.HasData {
		t.Errorf("28 Sept = %+v, want an empty day", empty)
	}
}

// Rows written with a time component (and a bank start date that comes back as
// RFC3339) must still land on the right day. Before the fix the unparsable
// start date left a zero time.Time, time.Sub saturated at ~292 years and the
// bank showed values in the hundreds of millions.
func TestCalendarNormalisesTimestampedDates(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUser(t, "owner@example.com", "2026-09-28T00:00:00Z", 1500)
	foodID := createTestFood(t)
	if _, err := database.DB.Exec(`
		INSERT INTO diary_entries (user_id, date, meal, food_id, quantity_grams, calories)
		VALUES (?, '2026-09-29T00:00:00Z', 'lunch', ?, 100, 500)
	`, userID, foodID); err != nil {
		t.Fatalf("inserting diary entry: %v", err)
	}

	response := getCalendarRange(t, "owner@example.com", "2026-09-28", "2026-09-30")

	if response.BankStart != "2026-09-28" {
		t.Errorf("BankStart = %q, want %q", response.BankStart, "2026-09-28")
	}

	day := calendarDay(t, response, "2026-09-29")
	if day.Calories != 500 {
		t.Errorf("Calories = %v, want 500", day.Calories)
	}
	if day.Meals["lunch"] != 500 {
		t.Errorf("Meals[lunch] = %d, want 500", day.Meals["lunch"])
	}
	// 2 completed days × 1500 − 500 consumed.
	if day.BankBalance != 2500 {
		t.Errorf("BankBalance = %d, want 2500", day.BankBalance)
	}
}

// A window that starts after the bank start date must carry the earlier
// consumption forward rather than restarting the running total.
func TestCalendarSeedsRunningTotalBeforeWindow(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	foodID := createTestFood(t)
	for _, date := range []string{"2026-09-01", "2026-09-02"} {
		if _, err := database.DB.Exec(`
			INSERT INTO diary_entries (user_id, date, meal, food_id, quantity_grams, calories)
			VALUES (?, ?, 'dinner', ?, 100, 1500)
		`, userID, date, foodID); err != nil {
			t.Fatalf("inserting diary entry: %v", err)
		}
	}

	response := getCalendarRange(t, "owner@example.com", "2026-09-03", "2026-09-04")
	day := calendarDay(t, response, "2026-09-03")

	// 3 completed days × 2000 = 6000 budget, 3000 consumed on the 1st and 2nd.
	if day.BankBalance != 3000 {
		t.Errorf("BankBalance = %d, want 3000 (earlier days carried forward)", day.BankBalance)
	}
}
