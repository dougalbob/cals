package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"cals/internal/auth"
	"cals/internal/database"
)

func setupHandlerDB(t *testing.T) {
	t.Helper()
	database.Close()
	if err := database.Initialize(filepath.Join(t.TempDir(), "test.db")); err != nil {
		t.Fatalf("database.Initialize() error = %v", err)
	}
	t.Cleanup(database.Close)
}

// createTestFood inserts a minimal food so diary entries satisfy the
// food_id-or-recipe_id check constraint.
func createTestFood(t *testing.T) int64 {
	t.Helper()
	result, err := database.DB.Exec(`INSERT INTO foods (name, calories_per_100g) VALUES ('Test food', 100)`)
	if err != nil {
		t.Fatalf("inserting food: %v", err)
	}
	id, _ := result.LastInsertId()
	return id
}

// createTestUser inserts a user with an explicit bank start date and goal.
func createTestUser(t *testing.T, email, bankStart string, goal int) int64 {
	t.Helper()
	result, err := database.DB.Exec(`
		INSERT INTO users (email, name, daily_calorie_goal, daily_water_goal_ml, bank_start_date)
		VALUES (?, '', ?, 2000, ?)
	`, email, goal, bankStart)
	if err != nil {
		t.Fatalf("inserting user: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("user id: %v", err)
	}
	return id
}

func getBank(t *testing.T, email, asOfDate string) BankResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/bank?date="+asOfDate, nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.UserEmailKey, email))
	recorder := httptest.NewRecorder()

	HandleGetBank(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/bank status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response BankResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decoding bank response: %v", err)
	}
	return response
}

// Regression test for product decision 1: drink calories count towards the
// calorie bank, exactly like food calories.
func TestBankIncludesDrinkCalories(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	foodID := createTestFood(t)
	if _, err := database.DB.Exec(`
		INSERT INTO diary_entries (user_id, date, meal, food_id, quantity_grams, calories)
		VALUES (?, '2026-09-28', 'breakfast', ?, 100, 1200)
	`, userID, foodID); err != nil {
		t.Fatalf("inserting diary entry: %v", err)
	}

	result, err := database.DB.Exec(`INSERT INTO drinks (user_id, name, icon, volume_ml, calories) VALUES (?, 'Wine', '🍷', 175, 130)`, userID)
	if err != nil {
		t.Fatalf("inserting drink: %v", err)
	}
	drinkID, _ := result.LastInsertId()
	if _, err := database.DB.Exec(`INSERT INTO drink_entries (user_id, drink_id, date, volume_ml, calories) VALUES (?, ?, '2026-09-29', 175, 130)`, userID, drinkID); err != nil {
		t.Fatalf("inserting drink entry: %v", err)
	}

	// As of 30 September: two complete days (28th, 29th) at 1500 kcal = 3000
	// budget; consumed 1200 food + 130 drink = 1330; bank = 1670.
	bank := getBank(t, "wife@example.com", "2026-09-30")
	if bank.BankBalance != 1670 {
		t.Errorf("BankBalance = %d, want 1670 (food and drinks both counted)", bank.BankBalance)
	}
	if bank.TodayAvailable != 1500+1670 {
		t.Errorf("TodayAvailable = %d, want %d", bank.TodayAvailable, 1500+1670)
	}
}

func TestBankCountsDrinksFromBeforeTheStartDate(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUser(t, "wife@example.com", "2026-09-29", 1500)

	result, err := database.DB.Exec(`INSERT INTO drinks (user_id, name, icon, volume_ml, calories) VALUES (?, 'Beer', '🍺', 500, 200)`, userID)
	if err != nil {
		t.Fatalf("inserting drink: %v", err)
	}
	drinkID, _ := result.LastInsertId()

	// One drink before the start date (ignored) and one on the start date (counted).
	for _, date := range []string{"2026-09-28", "2026-09-29"} {
		if _, err := database.DB.Exec(`INSERT INTO drink_entries (user_id, drink_id, date, volume_ml, calories) VALUES (?, ?, ?, 500, 200)`, userID, drinkID, date); err != nil {
			t.Fatalf("inserting drink entry: %v", err)
		}
	}

	// One complete day (the 29th): 1500 budget − 200 drink = 1300.
	bank := getBank(t, "wife@example.com", "2026-09-30")
	if bank.BankBalance != 1300 {
		t.Errorf("BankBalance = %d, want 1300 (only the in-range drink counted)", bank.BankBalance)
	}
}

func TestBankWithoutDrinksIsUnchanged(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	foodID := createTestFood(t)
	if _, err := database.DB.Exec(`
		INSERT INTO diary_entries (user_id, date, meal, food_id, quantity_grams, calories)
		VALUES (?, '2026-09-28', 'dinner', ?, 100, 2500)
	`, userID, foodID); err != nil {
		t.Fatalf("inserting diary entry: %v", err)
	}

	// Food-only behaviour must not change: 2000 − 2500 = −500.
	bank := getBank(t, "husband@example.com", "2026-09-29")
	if bank.BankBalance != -500 {
		t.Errorf("BankBalance = %d, want -500 (unchanged food-only maths)", bank.BankBalance)
	}
}
