package handlers

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
)

// BankResponse represents the calorie bank status.
//
// The first five fields are the original contract. The window fields are
// additive (Phase 14 slice 14.2) so the figure can be audited and labelled:
// every surface that prints bank_balance must also say which window it covers,
// so a windowed balance can never be mistaken for an all-time one (decision 66).
//
// StartDate is deliberately the raw stored value rather than the normalised
// YYYY-MM-DD that WindowStartDate uses: the column is declared DATE, so the
// driver hands it back as RFC3339. Its wire shape is an open question recorded
// in docs/product/vision-and-open-questions.md, so it is left exactly as the
// pre-window endpoint returned it; the maths normalises internally via isoDate.
type BankResponse struct {
	DailyGoal      int    `json:"daily_goal"`
	BankBalance    int    `json:"bank_balance"`
	TodayAvailable int    `json:"today_available"`
	StartDate      string `json:"start_date"`
	AsOfDate       string `json:"as_of_date"`

	// WindowDays is the configured window length: the bank sums the previous N
	// completed calendar days, as-of excluded because today is always in
	// progress (decisions 66, 92). 0 means "all time" — no length limit, still
	// bounded below by start_date and still excluding unlogged days (decision 91).
	WindowDays int `json:"window_days"`
	// WindowStartDate is the first calendar day inside the window after the
	// start-date floor is applied. Empty when the bank has not started.
	WindowStartDate string `json:"window_start_date"`
	// DaysCounted is how many days in the window had logging, and therefore
	// contributed (goal − consumed). Decision 42.
	DaysCounted int `json:"days_counted"`
	// DaysUnlogged is how many days in the window were excluded because nothing
	// was logged at all.
	DaysUnlogged int `json:"days_unlogged"`
}

// bankWindow is the rolling window one user's bank is computed over.
//
// One rule serves every surface (decision 66): the Banked/Deficit tile, the
// ring, today_available, GET /api/bank, GET /api/stats/bank and the Calendar's
// end-of-day figures all call computeBankWindow, so the three surfaces cannot
// drift apart the way the Calendar's RFC3339 incident drifted.
type bankWindow struct {
	Goal int
	// Days is the window length; 0 means "all time" (decisions 66, 91).
	Days int
	// StartDate is the bank's floor, YYYY-MM-DD. "" when no bank is started.
	StartDate string
}

// windowStartDate is the first calendar day that can contribute to the bank for
// an as-of date: the window's length applied to the previous completed days
// (decision 92), floored at the bank's start date (decision 66). It returns ""
// when there is no window at all — no start date, or an as-of date on or before
// the start date, in which case the bank is zero.
func (w bankWindow) windowStartDate(asOfDate string) string {
	if w.StartDate == "" || asOfDate <= w.StartDate {
		return ""
	}
	if w.Days > 0 {
		if limit := addDaysUTC(asOfDate, -w.Days); limit > w.StartDate {
			return limit
		}
	}
	return w.StartDate
}

// bankWindowResult is one as-of date's windowed bank plus its audit fields.
type bankWindowResult struct {
	Balance      int
	WindowStart  string
	DaysCounted  int
	DaysUnlogged int
}

// computeBankWindow applies the windowed bank rule for one as-of date.
//
// `consumedByDay` holds the food + drink calorie total for each day that has
// logging; a key present means the day has entries. Decision 42: only days that
// have logging contribute — a day with no entries at all is a wash, adding
// neither the day's budget nor its spend, which is what removes the free day's
// budget unlogged days used to add. Decision 91: the same rule applies at every
// window length, "all time" included.
//
// A day counts as logged when either ledger has an entry for it, even if the
// entry carries zero calories (a logged glass of water, say). The ledgers are
// the bank's own two: food and drinks (decision 1).
func computeBankWindow(window bankWindow, asOfDate string, consumedByDay map[string]float64) bankWindowResult {
	start := window.windowStartDate(asOfDate)
	if start == "" {
		return bankWindowResult{}
	}
	result := bankWindowResult{WindowStart: start}

	first, errFirst := time.Parse("2006-01-02", start)
	last, errLast := time.Parse("2006-01-02", asOfDate)
	if errFirst != nil || errLast != nil {
		// Both dates are normalised ISO by the callers; an unparseable one would
		// otherwise walk forever, because addDaysUTC returns its input unchanged.
		return bankWindowResult{}
	}

	var consumed float64
	for day := first; day.Before(last); day = day.AddDate(0, 0, 1) {
		kcal, logged := consumedByDay[day.Format("2006-01-02")]
		if !logged {
			continue
		}
		result.DaysCounted++
		consumed += kcal
	}
	result.DaysUnlogged = daysBetween(start, asOfDate) - result.DaysCounted
	// One rounding for the whole window, half away from zero, shared by every
	// surface. Rounding per day instead would let two half-calorie days disagree
	// with one rounded total — the kind of off-by-one that made the Calendar and
	// /api/bank differ before this slice.
	result.Balance = int(math.Round(float64(result.DaysCounted*window.Goal) - consumed))
	return result
}

// loadBankDayTotals returns per-day calorie totals for every day in
// [fromIso, toIsoInclusive] that has at least one entry in either ledger. A key
// being present is what marks a day as logged (decision 42), so a day whose
// entries total zero calories is still present with a 0 value.
//
// Both ledgers are in scope: drink calories count towards the bank (decision 1).
// The filter compares the bare `date` column against ISO literals — wrapping the
// column in date() defeats the (user_id, date) index — and uses an exclusive
// upper bound, which also picks up any row written with a time component that an
// inclusive `date <= ?` comparison would miss. date(date) is applied only in the
// projection, where it normalises the key and does not touch the index.
func loadBankDayTotals(userID int64, fromIso, toIsoInclusive string) (map[string]float64, error) {
	rows, err := database.DB.Query(`
		SELECT date(date) AS day, COALESCE(SUM(calories), 0)
		FROM (
			SELECT date, calories FROM diary_entries
			WHERE user_id = ? AND date >= ? AND date < ?
			UNION ALL
			SELECT date, calories FROM drink_entries
			WHERE user_id = ? AND date >= ? AND date < ?
		)
		GROUP BY day
	`, userID, fromIso, addDaysUTC(toIsoInclusive, 1), userID, fromIso, addDaysUTC(toIsoInclusive, 1))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	totals := make(map[string]float64)
	for rows.Next() {
		var day string
		var kcal float64
		if err := rows.Scan(&day, &kcal); err != nil {
			continue
		}
		totals[isoDate(day)] += kcal
	}
	return totals, nil
}

// daysBetween returns the number of calendar days from a to b (b − a), both
// YYYY-MM-DD. A malformed input returns 0 rather than an absurd day count.
func daysBetween(fromIso, toIso string) int {
	from, errFrom := time.Parse("2006-01-02", fromIso)
	to, errTo := time.Parse("2006-01-02", toIso)
	if errFrom != nil || errTo != nil {
		return 0
	}
	return int(to.Sub(from).Hours() / 24)
}

// HandleGetBank returns the windowed calorie bank for an as-of date.
//
// The bank is the sum of (daily goal − consumed) over the previous N completed
// calendar days, where N is the user's bank_window_days, the as-of date is
// excluded because today is always in progress, the window is floored at
// bank_start_date, and days with no logging at all are excluded (decisions 42,
// 66, 91, 92).
func HandleGetBank(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Date to calculate bank up to (not including this date). Accepts the
	// RFC3339 shape the app's own GET /api/users/me still leaks, normalising it
	// to the ISO date the maths uses; anything else malformed is a 400 rather
	// than a database error.
	asOfDate := isoDate(r.URL.Query().Get("date"))
	if asOfDate == "" {
		http.Error(w, "date parameter is required", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", asOfDate); err != nil {
		http.Error(w, "invalid date (want YYYY-MM-DD)", http.StatusBadRequest)
		return
	}

	// user.BankStartDate can arrive as "2026-09-30T00:00:00Z": the column is
	// declared DATE, so the sqlite driver converts it and database/sql renders
	// it as RFC3339 when scanned into a string. The maths runs on the
	// normalised date; the response's start_date field keeps the raw shape it
	// has always had (see BankResponse).
	window := bankWindow{
		Goal:      user.DailyCalorieGoal,
		Days:      user.BankWindowDays,
		StartDate: isoDate(user.BankStartDate),
	}

	result := bankWindowResult{WindowStart: window.StartDate}
	if start := window.windowStartDate(asOfDate); start != "" {
		consumedByDay, err := loadBankDayTotals(user.ID, start, addDaysUTC(asOfDate, -1))
		if err != nil {
			http.Error(w, "Database error loading bank days: "+err.Error(), http.StatusInternalServerError)
			return
		}
		result = computeBankWindow(window, asOfDate, consumedByDay)
	}

	// Today's available = daily goal + bank balance.
	todayAvailable := user.DailyCalorieGoal + result.Balance

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(BankResponse{
		DailyGoal:       user.DailyCalorieGoal,
		BankBalance:     result.Balance,
		TodayAvailable:  todayAvailable,
		StartDate:       user.BankStartDate,
		AsOfDate:        asOfDate,
		WindowDays:      user.BankWindowDays,
		WindowStartDate: result.WindowStart,
		DaysCounted:     result.DaysCounted,
		DaysUnlogged:    result.DaysUnlogged,
	})
}
