package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"cals/internal/auth"
	"cals/internal/database"
)

type DailyCalories struct {
	Date     string  `json:"date"`
	Calories float64 `json:"calories"`
	Goal     int     `json:"goal"`
}

type DailyBank struct {
	Date    string  `json:"date"`
	Balance float64 `json:"balance"`
}

func HandleGetCalorieStats(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	var dailyGoal int
	err := database.DB.QueryRow(`SELECT id, daily_calorie_goal FROM users WHERE email = ?`, email).Scan(&userID, &dailyGoal)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	days := 14
	if d := r.URL.Query().Get("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 && parsed <= 90 {
			days = parsed
		}
	}

	rows, err := database.DB.Query(`
		WITH RECURSIVE dates(date) AS (
			SELECT date('now', '-' || ? || ' days')
			UNION ALL
			SELECT date(date, '+1 day')
			FROM dates
			WHERE date < date('now')
		)
		SELECT 
			d.date,
			COALESCE(SUM(e.calories), 0) as calories
		FROM dates d
		LEFT JOIN diary_entries e ON e.date = d.date AND e.user_id = ?
		GROUP BY d.date
		ORDER BY d.date ASC
	`, days-1, userID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var stats []DailyCalories
	for rows.Next() {
		var s DailyCalories
		if err := rows.Scan(&s.Date, &s.Calories); err != nil {
			continue
		}
		s.Goal = dailyGoal
		stats = append(stats, s)
	}

	if stats == nil {
		stats = []DailyCalories{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func HandleGetBankStats(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	var dailyGoal int
	var bankStartDate string
	err := database.DB.QueryRow(`SELECT id, daily_calorie_goal, COALESCE(bank_start_date, date('now', '-30 days')) FROM users WHERE email = ?`, email).Scan(&userID, &dailyGoal, &bankStartDate)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	days := 14
	if d := r.URL.Query().Get("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 && parsed <= 90 {
			days = parsed
		}
	}

	// Calculate cumulative bank for each day
	rows, err := database.DB.Query(`
		WITH RECURSIVE dates(date) AS (
			SELECT date('now', '-' || ? || ' days')
			UNION ALL
			SELECT date(date, '+1 day')
			FROM dates
			WHERE date < date('now')
		),
		daily_totals AS (
			SELECT 
				d.date,
				COALESCE(SUM(e.calories), 0) as calories
			FROM dates d
			LEFT JOIN diary_entries e ON e.date = d.date AND e.user_id = ?
			WHERE d.date >= ?
			GROUP BY d.date
		)
		SELECT 
			date,
			(julianday(date) - julianday(?) + 1) * ? - 
			(SELECT COALESCE(SUM(calories), 0) FROM diary_entries WHERE user_id = ? AND date <= daily_totals.date AND date >= ?) as balance
		FROM daily_totals
		ORDER BY date ASC
	`, days-1, userID, bankStartDate, bankStartDate, dailyGoal, userID, bankStartDate)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var stats []DailyBank
	for rows.Next() {
		var s DailyBank
		if err := rows.Scan(&s.Date, &s.Balance); err != nil {
			continue
		}
		stats = append(stats, s)
	}

	if stats == nil {
		stats = []DailyBank{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
