package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"cals/internal/database"
	"cals/internal/models"
)

// Slice 14.1 — the metrics series endpoints.
//
// Two things are pinned here. First, every date that reaches the JSON is a
// plain YYYY-MM-DD: these columns are declared DATE, so mattn/go-sqlite3 hands
// back RFC3339 when the scan destination is a string, and the legacy Metrics
// screen already mis-compares it (web/static/js/components/metrics.js:74).
// Second, GET /api/stats/* counts drink calories, so a chart built on them
// cannot disagree with the ring drawn from GET /api/bank.

var plainISODate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func assertPlainDates(t *testing.T, what string, dates []string) {
	t.Helper()
	if len(dates) == 0 {
		t.Fatalf("%s returned no rows, so the date format was not exercised", what)
	}
	for _, date := range dates {
		if !plainISODate.MatchString(date) {
			t.Errorf("%s date = %q, want plain YYYY-MM-DD (the DATE column leaks RFC3339)", what, date)
		}
	}
}

func getCalorieStats(t *testing.T, email, query string) (int, []DailyCalories) {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetCalorieStats(recorder, authedRequest(t, http.MethodGet, "/api/stats/calories"+query, "", email))
	if recorder.Code != http.StatusOK {
		return recorder.Code, nil
	}
	var stats []DailyCalories
	if err := json.NewDecoder(recorder.Body).Decode(&stats); err != nil {
		t.Fatalf("decoding calorie stats: %v", err)
	}
	return recorder.Code, stats
}

func getBankStats(t *testing.T, email, query string) (int, []DailyBank) {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetBankStats(recorder, authedRequest(t, http.MethodGet, "/api/stats/bank"+query, "", email))
	if recorder.Code != http.StatusOK {
		return recorder.Code, nil
	}
	var stats []DailyBank
	if err := json.NewDecoder(recorder.Body).Decode(&stats); err != nil {
		t.Fatalf("decoding bank stats: %v", err)
	}
	return recorder.Code, stats
}

// logFoodFor inserts a diary row directly; the handlers under test only read.
func logFoodFor(t *testing.T, userID int64, date string, calories float64) {
	t.Helper()
	foodID := createTestFood(t)
	if _, err := database.DB.Exec(`
		INSERT INTO diary_entries (user_id, date, meal, food_id, quantity_grams, calories)
		VALUES (?, ?, 'dinner', ?, 100, ?)
	`, userID, date, foodID, calories); err != nil {
		t.Fatalf("inserting diary entry: %v", err)
	}
}

func logDrinkFor(t *testing.T, userID int64, date string, calories int) {
	t.Helper()
	drinkID := insertDrink(t, userID, "Coffee", "☕", 300, calories, false)
	if _, err := database.DB.Exec(`
		INSERT INTO drink_entries (user_id, drink_id, date, volume_ml, calories)
		VALUES (?, ?, ?, 300, ?)
	`, userID, drinkID, date, calories); err != nil {
		t.Fatalf("inserting drink entry: %v", err)
	}
}

func TestCalorieStatsCarriesPlainDatesAndDrinkCalories(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	yesterday := addDaysUTC(today, -1)
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -30), 2000)

	logFoodFor(t, userID, yesterday, 500)
	logDrinkFor(t, userID, yesterday, 150)

	code, stats := getCalorieStats(t, "wife@example.com", "?days=7")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}

	dates := make([]string, 0, len(stats))
	for _, day := range stats {
		dates = append(dates, day.Date)
	}
	assertPlainDates(t, "GET /api/stats/calories", dates)

	if len(stats) != 7 {
		t.Fatalf("got %d rows, want 7 (one per day in the window)", len(stats))
	}
	if last := stats[len(stats)-1].Date; last != today {
		t.Errorf("last row = %s, want today (%s)", last, today)
	}

	for _, day := range stats {
		if day.Date == yesterday {
			// 500 food + 150 drink. Before this change the handler summed
			// diary_entries alone and reported 500.
			if day.Calories != 650 {
				t.Errorf("calories on %s = %v, want 650 (food 500 + drink 150)", yesterday, day.Calories)
			}
			return
		}
	}
	t.Fatalf("no row for %s", yesterday)
}

func TestBankStatsCarriesPlainDates(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -30), 2000)
	logFoodFor(t, userID, addDaysUTC(today, -1), 500)

	code, stats := getBankStats(t, "wife@example.com", "?days=7")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}

	dates := make([]string, 0, len(stats))
	for _, day := range stats {
		dates = append(dates, day.Date)
	}
	assertPlainDates(t, "GET /api/stats/bank", dates)
	if len(stats) != 7 {
		t.Fatalf("got %d rows, want 7 (one per day in the window)", len(stats))
	}
}

// The bank series is still the cumulative figure from bank_start_date; the
// windowed bank replaces that in the next slice. What must not survive is the
// disagreement with GET /api/bank, which has counted drinks since Phase 12.
func TestBankStatsIncludesDrinkCalories(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	twoDaysAgo := addDaysUTC(today, -2)
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -3), 2000)

	logFoodFor(t, userID, twoDaysAgo, 500)
	logDrinkFor(t, userID, twoDaysAgo, 150)

	_, stats := getBankStats(t, "wife@example.com", "?days=7")

	var found bool
	for _, day := range stats {
		if day.Date != twoDaysAgo {
			continue
		}
		found = true
		// Two complete days of budget (the start date and the day after) minus
		// everything consumed since the start date, drinks included. Before
		// this change the handler summed diary_entries alone and reported 3500.
		if want := 2*2000 - 650.0; day.Balance != want {
			t.Errorf("balance on %s = %v, want %v (food 500 + drink 150)", twoDaysAgo, day.Balance, want)
		}
	}
	if !found {
		t.Fatalf("no row for %s", twoDaysAgo)
	}
}

// The series must begin on the bank's first day, not the day after it.
//
// This is a guard rather than a fix: today's COALESCE returns plain text, so
// the boundary is already right (a bare `SELECT bank_start_date` would come
// back as RFC3339, and a text comparison would then put the start day *before*
// its own boundary). Dropping the COALESCE is an obvious simplification, so the
// assertion and the isoDate in the handler keep it honest.
func TestBankStatsSeriesStartsOnTheBankStartDay(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	start := addDaysUTC(today, -5)
	userID := createTestUser(t, "husband@example.com", start, 2000)

	logFoodFor(t, userID, start, 100)

	_, stats := getBankStats(t, "husband@example.com", "?days=10")
	if len(stats) == 0 {
		t.Fatal("no rows returned")
	}
	if stats[0].Date != start {
		t.Errorf("series starts at %s, want the bank start day %s — the RFC3339 suffix must not push it out of range", stats[0].Date, start)
	}
}

func TestWeightEntriesCarryPlainDates(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -30), 2000)
	for _, offset := range []int{0, -1} {
		if _, err := database.DB.Exec(`
			INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, ?, 84.5)
		`, userID, addDaysUTC(today, offset)); err != nil {
			t.Fatalf("inserting weight entry: %v", err)
		}
	}

	recorder := httptest.NewRecorder()
	HandleGetWeightEntries(recorder, authedRequest(t, http.MethodGet, "/api/weight?days=7", "", "wife@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var entries []models.WeightEntry
	if err := json.NewDecoder(recorder.Body).Decode(&entries); err != nil {
		t.Fatalf("decoding weight entries: %v", err)
	}

	dates := make([]string, 0, len(entries))
	for _, entry := range entries {
		dates = append(dates, entry.Date)
	}
	assertPlainDates(t, "GET /api/weight", dates)
	if len(entries) != 2 {
		t.Errorf("got %d entries, want 2", len(entries))
	}
}

func TestMeasurementsCarryPlainDates(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -30), 2000)
	if _, err := database.DB.Exec(`
		INSERT INTO measurement_entries (user_id, date, waist_cm) VALUES (?, ?, 98.2)
	`, userID, addDaysUTC(today, -1)); err != nil {
		t.Fatalf("inserting measurement: %v", err)
	}

	recorder := httptest.NewRecorder()
	HandleGetMeasurements(recorder, authedRequest(t, http.MethodGet, "/api/measurements", "", "wife@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var entries []models.MeasurementEntry
	if err := json.NewDecoder(recorder.Body).Decode(&entries); err != nil {
		t.Fatalf("decoding measurements: %v", err)
	}

	dates := make([]string, 0, len(entries))
	for _, entry := range entries {
		dates = append(dates, entry.Date)
	}
	assertPlainDates(t, "GET /api/measurements", dates)
}

func TestStepsCarryPlainDates(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	userID := createTestUser(t, "husband@example.com", addDaysUTC(today, -30), 2000)
	// A fresh synced_at keeps the handler's background refresh goroutine off the
	// network; it still reads the database once, so the test waits for it below.
	if _, err := database.DB.Exec(`
		INSERT INTO step_entries (user_id, date, steps, synced_at) VALUES (?, ?, 8000, CURRENT_TIMESTAMP)
	`, userID, addDaysUTC(today, -1)); err != nil {
		t.Fatalf("inserting step entry: %v", err)
	}

	recorder := httptest.NewRecorder()
	HandleGetSteps(recorder, authedRequest(t, http.MethodGet, "/api/steps?days=7", "", "husband@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var entries []map[string]any
	if err := json.NewDecoder(recorder.Body).Decode(&entries); err != nil {
		t.Fatalf("decoding steps: %v", err)
	}

	dates := make([]string, 0, len(entries))
	for _, entry := range entries {
		date, _ := entry["date"].(string)
		dates = append(dates, date)
	}
	assertPlainDates(t, "GET /api/steps", dates)

	// Let the refresh goroutine finish before the cleanup closes the database.
	time.Sleep(25 * time.Millisecond)
}

// Decision 69's panning needs a range, not just "the last N days": both of
// these endpoints used to end at date('now') with no way to ask for an earlier
// window.
func TestSeriesRangeParametersAreHonoured(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -60), 2000)
	for _, offset := range []int{0, -1, -10} {
		if _, err := database.DB.Exec(`
			INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, ?, 84.5)
		`, userID, addDaysUTC(today, offset)); err != nil {
			t.Fatalf("inserting weight entry: %v", err)
		}
	}

	recorder := httptest.NewRecorder()
	target := "/api/weight?from=" + addDaysUTC(today, -3) + "&to=" + addDaysUTC(today, -1)
	HandleGetWeightEntries(recorder, authedRequest(t, http.MethodGet, target, "", "wife@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var entries []models.WeightEntry
	if err := json.NewDecoder(recorder.Body).Decode(&entries); err != nil {
		t.Fatalf("decoding weight entries: %v", err)
	}

	if len(entries) != 1 {
		t.Fatalf("got %d entries, want exactly the one inside the window", len(entries))
	}
	if entries[0].Date != addDaysUTC(today, -1) {
		t.Errorf("date = %s, want %s", entries[0].Date, addDaysUTC(today, -1))
	}

	// The same window on the bank series, which used to end at date('now')
	// however it was asked.
	code, stats := getBankStats(t, "wife@example.com", "?from="+addDaysUTC(today, -3)+"&to="+addDaysUTC(today, -1))
	if code != http.StatusOK {
		t.Fatalf("GET /api/stats/bank status = %d", code)
	}
	if len(stats) != 3 {
		t.Fatalf("GET /api/stats/bank returned %d rows, want the 3 days asked for", len(stats))
	}
	if stats[0].Date != addDaysUTC(today, -3) || stats[2].Date != addDaysUTC(today, -1) {
		t.Errorf("window = %s..%s, want %s..%s", stats[0].Date, stats[2].Date, addDaysUTC(today, -3), addDaysUTC(today, -1))
	}
}

// `days` now means exactly N days on every series endpoint. GET /api/weight
// used to filter on `date >= today - N days`, which is N+1 calendar days; the
// stats endpoints have always produced N. They agree now, which is the point of
// the slice.
func TestWeightDaysMeansExactlyThatManyDays(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -60), 2000)
	for _, offset := range []int{0, -6, -7} {
		if _, err := database.DB.Exec(`
			INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, ?, 84.5)
		`, userID, addDaysUTC(today, offset)); err != nil {
			t.Fatalf("inserting weight entry: %v", err)
		}
	}

	recorder := httptest.NewRecorder()
	HandleGetWeightEntries(recorder, authedRequest(t, http.MethodGet, "/api/weight?days=7", "", "wife@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var entries []models.WeightEntry
	if err := json.NewDecoder(recorder.Body).Decode(&entries); err != nil {
		t.Fatalf("decoding weight entries: %v", err)
	}

	if len(entries) != 2 {
		t.Fatalf("got %d entries, want 2 — the seventh day back is inside the window, the eighth is not", len(entries))
	}
	if oldest := entries[len(entries)-1].Date; oldest != addDaysUTC(today, -6) {
		t.Errorf("oldest entry = %s, want %s", oldest, addDaysUTC(today, -6))
	}
}

func TestSeriesRangeParametersAreValidated(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	createTestUser(t, "wife@example.com", addDaysUTC(today, -60), 2000)

	cases := []struct {
		name  string
		query string
	}{
		{"from without to", "?from=" + addDaysUTC(today, -3)},
		{"to without from", "?to=" + addDaysUTC(today, -1)},
		{"malformed from", "?from=03/10/2026&to=" + today},
		{"malformed to", "?from=" + addDaysUTC(today, -3) + "&to=yesterday"},
		{"to before from", "?from=" + today + "&to=" + addDaysUTC(today, -3)},
		{"range beyond the cap", "?from=" + addDaysUTC(today, -500) + "&to=" + today},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if code, _ := getCalorieStats(t, "wife@example.com", testCase.query); code != http.StatusBadRequest {
				t.Errorf("GET /api/stats/calories%s status = %d, want 400", testCase.query, code)
			}
			if code, _ := getBankStats(t, "wife@example.com", testCase.query); code != http.StatusBadRequest {
				t.Errorf("GET /api/stats/bank%s status = %d, want 400", testCase.query, code)
			}
		})
	}
}

// The two stats endpoints generate a row per calendar day, so a future `to`
// would fabricate zeros rather than report an absence. The endpoints that only
// filter existing rows (weight, steps) are deliberately not clamped.
func TestStatsRangeIsClampedToToday(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	createTestUser(t, "wife@example.com", addDaysUTC(today, -60), 2000)

	_, stats := getCalorieStats(t, "wife@example.com", "?from="+addDaysUTC(today, -1)+"&to="+addDaysUTC(today, 5))
	if len(stats) != 2 {
		t.Fatalf("got %d rows, want 2 — `to` should be pulled back to today", len(stats))
	}
	if last := stats[len(stats)-1].Date; last != today {
		t.Errorf("last row = %s, want today (%s)", last, today)
	}
}

// The `days` parameter keeps its old, deliberately lenient behaviour: V1 and
// the current React screen both use it, and an unparseable or over-cap value
// has always fallen back to the default rather than erroring.
func TestLegacyDaysParameterStillWorks(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	createTestUser(t, "wife@example.com", addDaysUTC(today, -60), 2000)

	for _, testCase := range []struct {
		query string
		want  int
	}{
		{"?days=3", 3},
		{"?days=not-a-number", 14},
		{"?days=500", 14},
		{"", 14},
	} {
		_, stats := getCalorieStats(t, "wife@example.com", testCase.query)
		if len(stats) != testCase.want {
			t.Errorf("GET /api/stats/calories%s returned %d rows, want %d", testCase.query, len(stats), testCase.want)
		}
		if len(stats) > 0 && stats[len(stats)-1].Date != today {
			t.Errorf("GET /api/stats/calories%s last row = %s, want today (%s)", testCase.query, stats[len(stats)-1].Date, today)
		}
	}
}
