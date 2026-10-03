package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
)

// CalendarDay is a single day's summary for the calendar views (decision 49 follow-up).
//
// It is deliberately additive: a new endpoint rather than a change to any existing
// response shape, because the calendar grid needs meal-level breakdowns and a hydration
// total that none of the existing stats endpoints return. Diary entries still store
// their own gram + nutrition snapshot; this only reads the existing rows.
type CalendarDay struct {
	Date              string         `json:"date"`
	FoodCalories      float64        `json:"food_calories"`
	DrinkCalories     float64        `json:"drink_calories"`
	Calories          float64        `json:"calories"`
	Goal              int            `json:"goal"`
	HydrationMl       int            `json:"hydration_ml"`
	HydrationTargetMl int            `json:"hydration_target_ml"`
	BankBalance       int            `json:"bank_balance"`
	Meals             map[string]int `json:"meals"`
	IsToday           bool           `json:"is_today"`
	HasData           bool           `json:"has_data"`
}

type calendarResponse struct {
	From      string        `json:"from"`
	To        string        `json:"to"`
	DailyGoal int           `json:"daily_goal"`
	BankStart string        `json:"bank_start"`
	Days      []CalendarDay `json:"days"`
}

// HandleGetCalendar returns per-day summaries for a date range, used by the
// React month/week calendar views. Query params:
//
//	from, to  ISO dates, inclusive. Bounded to 400 days max per request so a
//	          single mis-typed query cannot scan the whole table.
func HandleGetCalendar(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	if fromStr == "" || toStr == "" {
		http.Error(w, "from and to dates are required (YYYY-MM-DD)", http.StatusBadRequest)
		return
	}

	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		http.Error(w, "invalid from date", http.StatusBadRequest)
		return
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		http.Error(w, "invalid to date", http.StatusBadRequest)
		return
	}
	if to.Before(from) {
		http.Error(w, "to must be on or after from", http.StatusBadRequest)
		return
	}
	daySpan := int(to.Sub(from).Hours()/24) + 1
	if daySpan > 400 {
		http.Error(w, "range exceeds 400 days", http.StatusBadRequest)
		return
	}

	todayIso := time.Now().Format("2006-01-02")
	goal := user.DailyCalorieGoal
	waterGoal := user.DailyWaterGoalML
	startDate := user.BankStartDate

	// Build a contiguous calendar series for the range and pre-fill every date
	// so days with no entries still come back as zeros.
	idx := make(map[string]*CalendarDay, daySpan)
	days := make([]CalendarDay, 0, daySpan)
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		day := CalendarDay{
			Date:              key,
			Goal:              goal,
			HydrationTargetMl: waterGoal,
			Meals:             map[string]int{"breakfast": 0, "lunch": 0, "dinner": 0, "snacks": 0},
			IsToday:           key == todayIso,
		}
		days = append(days, day)
		idx[key] = &days[len(days)-1]
	}

	// Food calories per day, broken down by meal.
	mealRows, err := database.DB.Query(`
		SELECT date, meal, COALESCE(SUM(calories), 0)
		FROM diary_entries
		WHERE user_id = ? AND date >= ? AND date <= ?
		GROUP BY date, meal
	`, user.ID, fromStr, toStr)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	for mealRows.Next() {
		var datestr, meal string
		var kcal float64
		if err := mealRows.Scan(&datestr, &meal, &kcal); err != nil {
			continue
		}
		if day, ok := idx[datestr]; ok {
			day.Meals[meal] += int(kcal + 0.5)
			day.FoodCalories += kcal
		}
	}
	mealRows.Close()

	// Drink calories per day. Drinks are not broken down by meal — the calendar
	// shows meal-calorie spend from food entries only, matching the existing
	// Diary meal sections.
	drinkRows, err := database.DB.Query(`
		SELECT date, COALESCE(SUM(calories), 0)
		FROM drink_entries
		WHERE user_id = ? AND date >= ? AND date <= ?
		GROUP BY date
	`, user.ID, fromStr, toStr)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	for drinkRows.Next() {
		var datestr string
		var kcal float64
		if err := drinkRows.Scan(&datestr, &kcal); err != nil {
			continue
		}
		if day, ok := idx[datestr]; ok {
			day.DrinkCalories += kcal
		}
	}
	drinkRows.Close()

	// Hydration ml per day (drinks flagged counts_toward_water).
	hydrationRows, err := database.DB.Query(`
		SELECT de.date, COALESCE(SUM(de.volume_ml), 0)
		FROM drink_entries de
		JOIN drinks d ON d.id = de.drink_id
		WHERE de.user_id = ? AND de.date >= ? AND de.date <= ? AND d.counts_toward_water = 1
		GROUP BY de.date
	`, user.ID, fromStr, toStr)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	for hydrationRows.Next() {
		var datestr string
		var ml int
		if err := hydrationRows.Scan(&datestr, &ml); err != nil {
			continue
		}
		if day, ok := idx[datestr]; ok {
			day.HydrationMl = ml
		}
	}
	hydrationRows.Close()

	// Totals and has-data flag.
	for i := range days {
		d := &days[i]
		d.Calories = d.FoodCalories + d.DrinkCalories
		d.HasData = d.Calories > 0 || d.HydrationMl > 0
	}

	// Bank balance at end-of-day for each date. Mirrors HandleGetBank: for a
	// given date D the closing balance is
	//     completed_days_from_start_to_D * goal − total_consumed_in_that_window
	// which is equivalent to GET /api/bank?date=D+1. For days before startDate
	// the bank is 0 (no bank started yet).
	if startDate != "" {
		startT, _ := time.Parse("2006-01-02", startDate)

		// Per-day consumption totals (food + drink) from startDate to to.
		daily := make(map[string]float64)

		foodRows, err := database.DB.Query(`
			SELECT date, COALESCE(SUM(calories), 0)
			FROM diary_entries
			WHERE user_id = ? AND date >= ? AND date <= ?
			GROUP BY date
		`, user.ID, startDate, toStr)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		for foodRows.Next() {
			var datestr string
			var kcal float64
			if err := foodRows.Scan(&datestr, &kcal); err != nil {
				continue
			}
			daily[datestr] += kcal
		}
		foodRows.Close()

		drinkCRows, err := database.DB.Query(`
			SELECT date, COALESCE(SUM(calories), 0)
			FROM drink_entries
			WHERE user_id = ? AND date >= ? AND date <= ?
			GROUP BY date
		`, user.ID, startDate, toStr)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		for drinkCRows.Next() {
			var datestr string
			var kcal float64
			if err := drinkCRows.Scan(&datestr, &kcal); err != nil {
				continue
			}
			daily[datestr] += kcal
		}
		drinkCRows.Close()

		var running float64
		// Seed running total with any consumption between startDate and the day
		// before fromStr, so the balance is correct when the window starts mid-run.
		if fromStr > startDate {
			beforeFrom := from.AddDate(0, 0, -1).Format("2006-01-02")
			var seedFood, seedDrink float64
			database.DB.QueryRow(`
				SELECT COALESCE(SUM(calories), 0)
				FROM diary_entries
				WHERE user_id = ? AND date >= ? AND date <= ?
			`, user.ID, startDate, beforeFrom).Scan(&seedFood)
			database.DB.QueryRow(`
				SELECT COALESCE(SUM(calories), 0)
				FROM drink_entries
				WHERE user_id = ? AND date >= ? AND date <= ?
			`, user.ID, startDate, beforeFrom).Scan(&seedDrink)
			running = seedFood + seedDrink
		}

		for i := range days {
			d := &days[i]
			if d.Date < startDate {
				d.BankBalance = 0
				continue
			}
			running += daily[d.Date]
			completedDays := daysBetweenInclusive(startT, d.Date)
			d.BankBalance = completedDays*goal - int(running+0.5)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(calendarResponse{
		From:      fromStr,
		To:        toStr,
		DailyGoal: goal,
		BankStart: startDate,
		Days:      days,
	})
}

// daysBetweenInclusive returns the number of days from a to b, inclusive,
// treating both as UTC dates. Same-day returns 1.
func daysBetweenInclusive(a time.Time, bIso string) int {
	bt, err := time.Parse("2006-01-02", bIso)
	if err != nil {
		return 0
	}
	return int(bt.Sub(a).Hours()/24) + 1
}
