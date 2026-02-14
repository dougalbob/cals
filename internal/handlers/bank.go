package handlers

import (
	"encoding/json"
	"net/http"

	"cals/internal/auth"
	"cals/internal/database"
)

// BankResponse represents the calorie bank status
type BankResponse struct {
	DailyGoal      int    `json:"daily_goal"`
	BankBalance    int    `json:"bank_balance"`
	TodayAvailable int    `json:"today_available"`
	StartDate      string `json:"start_date"`
	AsOfDate       string `json:"as_of_date"`
}

// HandleGetBank calculates cumulative calorie bank up to (but not including) the specified date
func HandleGetBank(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Date to calculate bank up to (not including this date)
	asOfDate := r.URL.Query().Get("date")
	if asOfDate == "" {
		http.Error(w, "date parameter is required", http.StatusBadRequest)
		return
	}

	dailyGoal := user.DailyCalorieGoal
	startDate := user.BankStartDate

	// No start date set
	if startDate == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(BankResponse{
			DailyGoal:      dailyGoal,
			BankBalance:    0,
			TodayAvailable: dailyGoal,
			StartDate:      "",
			AsOfDate:       asOfDate,
		})
		return
	}

	// If viewing a date on or before start date, bank is 0
	if asOfDate <= startDate {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(BankResponse{
			DailyGoal:      dailyGoal,
			BankBalance:    0,
			TodayAvailable: dailyGoal,
			StartDate:      startDate,
			AsOfDate:       asOfDate,
		})
		return
	}

	// Calculate number of complete days between startDate and asOfDate
	// e.g., start=12th, asOf=14th means we count 12th and 13th (2 days)
	var dayCount int
	err = database.DB.QueryRow(`
		SELECT CAST(julianday(date(?)) - julianday(date(?)) AS INTEGER)
	`, asOfDate, startDate).Scan(&dayCount)
	if err != nil {
		http.Error(w, "Database error calculating days: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if dayCount <= 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(BankResponse{
			DailyGoal:      dailyGoal,
			BankBalance:    0,
			TodayAvailable: dailyGoal,
			StartDate:      startDate,
			AsOfDate:       asOfDate,
		})
		return
	}

	// Get total calories consumed from startDate up to (but not including) asOfDate
	var totalConsumed float64
	err = database.DB.QueryRow(`
		SELECT COALESCE(SUM(calories), 0)
		FROM diary_entries
		WHERE user_id = ? 
		AND date(date) >= date(?) 
		AND date(date) < date(?)
	`, user.ID, startDate, asOfDate).Scan(&totalConsumed)
	if err != nil {
		http.Error(w, "Database error calculating calories: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Bank = total budget for completed days - consumed
	// e.g., 2 days × 1500 = 3000 budget, consumed 2557, bank = 443
	totalBudget := dayCount * dailyGoal
	bankBalance := totalBudget - int(totalConsumed)
	
	// Today's available = daily goal + bank balance
	todayAvailable := dailyGoal + bankBalance

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(BankResponse{
		DailyGoal:      dailyGoal,
		BankBalance:    bankBalance,
		TodayAvailable: todayAvailable,
		StartDate:      startDate,
		AsOfDate:       asOfDate,
	})
}
