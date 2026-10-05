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
	// BankWindowDays is the window each cell's end-of-day balance was computed
	// over; 0 means "all time" (decisions 66, 91, 92). Additive in slice 14.2
	// so the cells can be labelled with the window they cover.
	BankWindowDays int           `json:"bank_window_days"`
	Days           []CalendarDay `json:"days"`
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
	// user.BankStartDate can arrive as "2026-04-15T00:00:00Z": columns declared
	// DATE are converted to time.Time by the sqlite driver and then rendered as
	// RFC3339 when scanned into a string (see isoDate).
	startDate := isoDate(user.BankStartDate)

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
	//
	// `date(date)` is deliberate, not cosmetic: selecting the bare column makes
	// the sqlite driver hand back a time.Time (the column is declared DATE),
	// which scans into a string as RFC3339 and would never match the
	// YYYY-MM-DD keys in `idx`. date(...) is an expression, so it has no
	// declared type and comes back as plain text. It also normalises any row
	// that was written with a time component. Same reasoning for every query
	// below — and it mirrors what HandleGetBank already does.
	mealRows, err := database.DB.Query(`
		SELECT date(date) AS day, meal, COALESCE(SUM(calories), 0)
		FROM diary_entries
		WHERE user_id = ? AND date(date) >= date(?) AND date(date) <= date(?)
		GROUP BY day, meal
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
		if day, ok := idx[isoDate(datestr)]; ok {
			day.Meals[meal] += int(kcal + 0.5)
			day.FoodCalories += kcal
		}
	}
	mealRows.Close()

	// Drink calories per day. Drinks are not broken down by meal — the calendar
	// shows meal-calorie spend from food entries only, matching the existing
	// Diary meal sections.
	drinkRows, err := database.DB.Query(`
		SELECT date(date) AS day, COALESCE(SUM(calories), 0)
		FROM drink_entries
		WHERE user_id = ? AND date(date) >= date(?) AND date(date) <= date(?)
		GROUP BY day
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
		if day, ok := idx[isoDate(datestr)]; ok {
			day.DrinkCalories += kcal
		}
	}
	drinkRows.Close()

	// Hydration ml per day (drinks flagged counts_toward_water).
	hydrationRows, err := database.DB.Query(`
		SELECT date(de.date) AS day, COALESCE(SUM(de.volume_ml), 0)
		FROM drink_entries de
		JOIN drinks d ON d.id = de.drink_id
		WHERE de.user_id = ? AND date(de.date) >= date(?) AND date(de.date) <= date(?) AND d.counts_toward_water = 1
		GROUP BY day
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
		if day, ok := idx[isoDate(datestr)]; ok {
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

	// Bank balance at end-of-day for each date, computed by the same windowed
	// rule as GET /api/bank (decisions 42, 66, 91, 92) so the Calendar cannot
	// disagree with Today or the Diary — the class of bug the RFC3339 incident
	// came from. For a date D the closing balance is the bank as of D+1, i.e.
	// the figure available to spend on D+1, which is not the same date but is
	// the same rule and the same helper (computeBankWindow).
	bank := bankWindow{Goal: goal, Days: user.BankWindowDays, StartDate: startDate}
	if startDate != "" {
		consumedByDay := map[string]float64{}
		// The earliest day that can contribute to any cell is the window start
		// for the earliest day that has a balance at all: the day after
		// max(from, bank_start_date), since a cell's balance is the bank as of
		// the following morning and days before the bank started are zero.
		firstDay := fromStr
		if firstDay < startDate {
			firstDay = startDate
		}
		if firstDay <= toStr {
			if windowStart := bank.windowStartDate(addDaysUTC(firstDay, 1)); windowStart != "" {
				consumedByDay, err = loadBankDayTotals(user.ID, windowStart, toStr)
				if err != nil {
					http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
					return
				}
			}
		}
		for i := range days {
			d := &days[i]
			if d.Date < startDate {
				d.BankBalance = 0
				continue
			}
			d.BankBalance = computeBankWindow(bank, addDaysUTC(d.Date, 1), consumedByDay).Balance
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(calendarResponse{
		From:           fromStr,
		To:             toStr,
		DailyGoal:      goal,
		BankStart:      startDate,
		BankWindowDays: user.BankWindowDays,
		Days:           days,
	})
}

// isoDate normalises a date string to YYYY-MM-DD.
//
// Columns declared DATE/DATETIME are converted to time.Time by
// mattn/go-sqlite3 (it reads the declared type via sqlite3_column_decltype),
// and database/sql then renders that time.Time as RFC3339 when the
// destination is a string. So a row holding "2026-09-07" scans back as
// "2026-09-07T00:00:00Z". Anything keyed or parsed as a bare ISO date has to
// cope with that — the legacy UI does the same thing with
// `bank_start_date.split('T')[0]`.
func isoDate(s string) string {
	if len(s) >= 10 {
		return s[:10]
	}
	return s
}
