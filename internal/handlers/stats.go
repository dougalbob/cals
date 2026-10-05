package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
)

// maxSeriesSpan bounds an explicit from/to request, mirroring
// GET /api/calendar, so a single mis-typed range cannot scan a whole table.
const maxSeriesSpan = 400

// todayUTC anchors the legacy `days` parameter. SQLite's date('now') is UTC, so
// this has to be UTC as well — the container runs TZ=Europe/London, and a local
// "today" would disagree with the SQL for the first hour of every day.
func todayUTC() string {
	return time.Now().UTC().Format("2006-01-02")
}

// addDaysUTC shifts an ISO date, returning it unchanged if it will not parse.
func addDaysUTC(iso string, delta int) string {
	parsed, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return iso
	}
	return parsed.AddDate(0, 0, delta).Format("2006-01-02")
}

// resolveSeriesRange works out the inclusive date window for a metrics series
// endpoint.
//
// An explicit from/to pair wins. Otherwise the legacy `days` parameter counts
// back from today, exactly as before, so V1 and the current React Metrics
// screen keep working untouched. `maxDays` caps that legacy path (0 means no
// cap); an unparseable or out-of-range `days` is ignored in favour of the
// default, which is the behaviour these endpoints have always had.
//
// The new from/to path is strict instead: a malformed range is a 400 rather
// than a silently narrowed window, because a chart that quietly shows the wrong
// fortnight is worse than an error. When clampToToday is set, `to` is pulled
// back to today — that is for the endpoints which *generate* a row per calendar
// day, where a future row would be a fabricated zero rather than an absence.
func resolveSeriesRange(w http.ResponseWriter, r *http.Request, defaultDays, maxDays int, clampToToday bool) (string, string, bool) {
	query := r.URL.Query()
	from := query.Get("from")
	to := query.Get("to")

	if from == "" && to == "" {
		days := defaultDays
		if raw := query.Get("days"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && (maxDays == 0 || parsed <= maxDays) {
				days = parsed
			}
		}
		end := todayUTC()
		return addDaysUTC(end, -(days - 1)), end, true
	}

	if from == "" || to == "" {
		http.Error(w, "from and to must both be given (YYYY-MM-DD)", http.StatusBadRequest)
		return "", "", false
	}

	startDate, err := time.Parse("2006-01-02", from)
	if err != nil {
		http.Error(w, "invalid from date (want YYYY-MM-DD)", http.StatusBadRequest)
		return "", "", false
	}
	endDate, err := time.Parse("2006-01-02", to)
	if err != nil {
		http.Error(w, "invalid to date (want YYYY-MM-DD)", http.StatusBadRequest)
		return "", "", false
	}
	if endDate.Before(startDate) {
		http.Error(w, "to must be on or after from", http.StatusBadRequest)
		return "", "", false
	}
	if int(endDate.Sub(startDate).Hours()/24)+1 > maxSeriesSpan {
		http.Error(w, "range exceeds "+strconv.Itoa(maxSeriesSpan)+" days", http.StatusBadRequest)
		return "", "", false
	}

	if clampToToday {
		if today := todayUTC(); to > today {
			to = today
		}
	}
	return from, to, true
}

type DailyCalories struct {
	Date     string  `json:"date"`
	Calories float64 `json:"calories"`
	Goal     int     `json:"goal"`
}

type DailyBank struct {
	Date    string  `json:"date"`
	Balance float64 `json:"balance"`
}

// HandleGetCalorieStats returns one row per day in the window.
//
// Calories are food **and** drink (decision 1: drink calories count towards the
// bank). Before this the handler summed diary_entries alone, so a chart built on
// it disagreed with the ring drawn from the same day's data.
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

	from, to, ok := resolveSeriesRange(w, r, 14, 90, true)
	if !ok {
		return
	}

	// The generated date series comes from expressions rather than a declared
	// DATE column, so it scans as plain text and needs no normalisation. The
	// two ledgers are aggregated over a bounded range first: filtering inside
	// the join kept the (user_id, date) index usable and still does.
	rows, err := database.DB.Query(`
		WITH RECURSIVE dates(day) AS (
			SELECT date(?)
			UNION ALL
			SELECT date(day, '+1 day')
			FROM dates
			WHERE day < date(?)
		),
		food AS (
			SELECT date(date) AS day, COALESCE(SUM(calories), 0) AS kcal
			FROM diary_entries
			WHERE user_id = ? AND date >= date(?) AND date <= date(?)
			GROUP BY day
		),
		fluids AS (
			SELECT date(date) AS day, COALESCE(SUM(calories), 0) AS kcal
			FROM drink_entries
			WHERE user_id = ? AND date >= date(?) AND date <= date(?)
			GROUP BY day
		)
		SELECT
			d.day,
			COALESCE(f.kcal, 0) + COALESCE(k.kcal, 0) AS calories
		FROM dates d
		LEFT JOIN food f ON f.day = d.day
		LEFT JOIN fluids k ON k.day = d.day
		ORDER BY d.day ASC
	`, from, to, userID, from, to, userID, from, to)
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
		s.Date = isoDate(s.Date)
		s.Goal = dailyGoal
		stats = append(stats, s)
	}

	if stats == nil {
		stats = []DailyCalories{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// HandleGetBankStats returns the end-of-day bank balance for each day in the
// window.
//
// Each figure is the closing balance for that day — the bank as of the next
// morning, i.e. GET /api/bank?date=<day + 1> — computed with the same windowed
// rule as HandleGetBank and the Calendar (decisions 42, 66, 91, 92). It used to
// be cumulative from bank_start_date and food-only, which would have put this
// series on different numbers from the tile, the ring and the Calendar.
//
// The series still starts at bank_start_date, and still defaults a missing
// start date to 30 days ago, exactly as before: only the numbers change, no day
// appears or disappears from the response.
//
// The isoDate on bank_start_date is belt-and-braces rather than a fix. The
// COALESCE already returns plain text — sqlite3_column_decltype is NULL for an
// expression, so the driver does not convert it — verified: a bare
// `SELECT bank_start_date` scans as "2026-09-30T00:00:00Z" while
// `SELECT COALESCE(bank_start_date, ...)` scans as "2026-09-30". Dropping the
// COALESCE would silently start excluding the bank's first day, because a text
// comparison puts '2026-09-30' before '2026-09-30T00:00:00Z'; the normalisation
// and TestBankStatsSeriesStartsOnTheBankStartDay make that refactor safe.
func HandleGetBankStats(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	var dailyGoal int
	var bankStartDate string
	var bankWindowDays int
	err := database.DB.QueryRow(`SELECT id, daily_calorie_goal, COALESCE(bank_start_date, date('now', '-30 days')), bank_window_days FROM users WHERE email = ?`, email).Scan(&userID, &dailyGoal, &bankStartDate, &bankWindowDays)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	bankStartDate = isoDate(bankStartDate)

	from, to, ok := resolveSeriesRange(w, r, 14, 90, true)
	if !ok {
		return
	}

	window := bankWindow{Goal: dailyGoal, Days: bankWindowDays, StartDate: bankStartDate}

	// Load every day that can contribute to any balance in the series. The first
	// emitted day is max(from, bank_start_date); its as-of date is the next day,
	// and that window's start is the earliest day any balance can reach back to.
	// The latest consumption that matters is the last day itself.
	firstDay := from
	if firstDay < bankStartDate {
		firstDay = bankStartDate
	}
	consumedByDay := map[string]float64{}
	if firstDay <= to {
		if windowStart := window.windowStartDate(addDaysUTC(firstDay, 1)); windowStart != "" {
			consumedByDay, err = loadBankDayTotals(userID, windowStart, to)
			if err != nil {
				http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	var stats []DailyBank
	for day := from; day <= to; day = addDaysUTC(day, 1) {
		// The series has always begun at the bank's start date.
		if day < bankStartDate {
			continue
		}
		result := computeBankWindow(window, addDaysUTC(day, 1), consumedByDay)
		stats = append(stats, DailyBank{Date: day, Balance: float64(result.Balance)})
	}

	if stats == nil {
		stats = []DailyBank{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
