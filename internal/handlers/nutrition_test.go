package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Slice 14.6 — the weekly report's date-range picker.
//
// GET /api/nutrition/weekly gains an explicit from/to pair beside the legacy
// `days` parameter: the report card asks for a chosen week, so the endpoint has
// to answer for any range rather than only for one anchored at today. The
// from/to path is strict and shared with the metrics series endpoints (slice
// 14.1 — a half-given or malformed range is a 400, `to` is clamped to today so
// a future row cannot be fabricated); `days` keeps its exact old contract,
// where an out-of-range value is still a 400 rather than a silent fallback.
//
// These tests fail against the pre-slice handler, which ignored from/to
// entirely and always answered for a window ending today.

func getWeeklyAnalysis(t *testing.T, email, query string) (int, WeeklyAnalysis, string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetWeeklyAnalysis(recorder, authedRequest(t, http.MethodGet, "/api/nutrition/weekly"+query, "", email))
	if recorder.Code != http.StatusOK {
		return recorder.Code, WeeklyAnalysis{}, recorder.Body.String()
	}
	var analysis WeeklyAnalysis
	if err := json.NewDecoder(recorder.Body).Decode(&analysis); err != nil {
		t.Fatalf("decoding weekly analysis: %v", err)
	}
	return recorder.Code, analysis, ""
}

func TestWeeklyAnalysisRangeReturnsExactlyTheRequestedDays(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	from := addDaysUTC(today, -9)
	to := addDaysUTC(today, -3)
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -40), 2000)

	// One day with food + a drink (calories must agree with the ring), one day
	// with food only, and the rest unlogged.
	logFoodFor(t, userID, addDaysUTC(from, 1), 500)
	logDrinkFor(t, userID, addDaysUTC(from, 1), 150)
	logFoodFor(t, userID, addDaysUTC(to, -1), 700)

	code, analysis, body := getWeeklyAnalysis(t, "wife@example.com", "?from="+from+"&to="+to)
	if code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", code, body)
	}

	if analysis.StartDate != from || analysis.EndDate != to {
		t.Errorf("window = %s..%s, want %s..%s", analysis.StartDate, analysis.EndDate, from, to)
	}
	if len(analysis.DailyData) != 7 {
		t.Fatalf("got %d days, want 7 (one per calendar day in the range)", len(analysis.DailyData))
	}
	if analysis.DailyData[0].Date != from || analysis.DailyData[len(analysis.DailyData)-1].Date != to {
		t.Errorf("days run %s..%s, want %s..%s",
			analysis.DailyData[0].Date, analysis.DailyData[len(analysis.DailyData)-1].Date, from, to)
	}
	for i, day := range analysis.DailyData {
		expected := addDaysUTC(from, i)
		if day.Date != expected {
			t.Errorf("day %d = %s, want %s (dates must be contiguous and ascending)", i, day.Date, expected)
		}
	}
	if analysis.DaysWithData != 2 {
		t.Errorf("days with data = %d, want 2", analysis.DaysWithData)
	}

	for _, day := range analysis.DailyData {
		switch day.Date {
		case addDaysUTC(from, 1):
			if day.Calories != 650 || day.FoodCalories != 500 || day.DrinkCalories != 150 {
				t.Errorf("calories on %s = food %v + drink %v = %v, want 500 + 150 = 650",
					day.Date, day.FoodCalories, day.DrinkCalories, day.Calories)
			}
		case addDaysUTC(to, -1):
			if day.Calories != 700 {
				t.Errorf("calories on %s = %v, want 700", day.Date, day.Calories)
			}
		default:
			if day.Calories != 0 {
				t.Errorf("calories on unlogged day %s = %v, want 0", day.Date, day.Calories)
			}
		}
	}

	// Averages come only from the days with data, exactly as the legacy window
	// did (decision 42's exclusion rule) — (500+150+700) / 2.
	if want := 675.0; analysis.Averages.Calories != want {
		t.Errorf("average calories = %v, want %v (days with data only)", analysis.Averages.Calories, want)
	}
}

func TestWeeklyAnalysisRangeClampsAFutureToToday(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	from := addDaysUTC(today, -2)
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -40), 2000)
	logFoodFor(t, userID, from, 400)

	code, analysis, body := getWeeklyAnalysis(t, "wife@example.com", "?from="+from+"&to="+addDaysUTC(today, 5))
	if code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", code, body)
	}
	if analysis.EndDate != today {
		t.Errorf("end date = %s, want today (%s) — a future `to` must be clamped, not fabricated", analysis.EndDate, today)
	}
	if len(analysis.DailyData) != 3 {
		t.Errorf("got %d days, want 3 (today and the two before it)", len(analysis.DailyData))
	}
}

func TestWeeklyAnalysisRangeValidation(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", addDaysUTC(todayUTC(), -40), 2000)

	today := todayUTC()
	cases := []struct {
		name  string
		query string
	}{
		{"from without to", "?from=" + addDaysUTC(today, -6)},
		{"to without from", "?to=" + today},
		{"malformed from", "?from=06-10-2026&to=" + today},
		{"malformed to", "?from=" + addDaysUTC(today, -6) + "&to=2026-10-05T00:00:00Z"},
		{"to before from", "?from=" + addDaysUTC(today, -2) + "&to=" + addDaysUTC(today, -3)},
		{"span over the series cap", "?from=" + addDaysUTC(today, -400) + "&to=" + today},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code, _, _ := getWeeklyAnalysis(t, "wife@example.com", tc.query)
			if code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400 — a malformed range is an error, not a silently narrowed window", code)
			}
		})
	}
}

// The legacy `days` contract must be byte-for-byte what it was: V1 and the
// Nutrition screen both read it, and an out-of-range value has always been a
// 400 rather than a fallback to the default (unlike the stats endpoints).
func TestWeeklyAnalysisLegacyDaysContractIsUnchanged(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", addDaysUTC(todayUTC(), -40), 2000)
	logFoodFor(t, userID, todayUTC(), 400)

	code, analysis, body := getWeeklyAnalysis(t, "wife@example.com", "?days=7")
	if code != http.StatusOK {
		t.Fatalf("days=7 status = %d, body = %s", code, body)
	}
	if len(analysis.DailyData) != 7 {
		t.Errorf("days=7 returned %d days, want 7", len(analysis.DailyData))
	}
	if want := time.Now().Format("2006-01-02"); analysis.EndDate != want {
		t.Errorf("days=7 ended %s, want %s (the legacy window is anchored at the local today, as before)", analysis.EndDate, want)
	}

	for _, query := range []string{"?days=0", "?days=91", "?days=last-week"} {
		if code, _, _ := getWeeklyAnalysis(t, "wife@example.com", query); code != http.StatusBadRequest {
			t.Errorf("%s status = %d, want 400 (legacy validation is unchanged)", query, code)
		}
	}

	// No parameters: the documented default of 7 days.
	code, analysis, body = getWeeklyAnalysis(t, "wife@example.com", "")
	if code != http.StatusOK {
		t.Fatalf("no-params status = %d, body = %s", code, body)
	}
	if len(analysis.DailyData) != 7 {
		t.Errorf("default window returned %d days, want 7", len(analysis.DailyData))
	}
}

// The range is the report's window, not the bank's: a day before
// bank_start_date still appears with its real diary data (the report shows the
// week the user picked, unlogged days included, so decision 42's exclusions
// can be labelled) — unlike the bank series, which starts on the bank's first
// day.
func TestWeeklyAnalysisRangeIsNotFlooredAtTheBankStart(t *testing.T) {
	setupHandlerDB(t)

	today := todayUTC()
	from := addDaysUTC(today, -6)
	// The bank starts two days ago, but the report still covers the full week.
	userID := createTestUser(t, "wife@example.com", addDaysUTC(today, -2), 2000)
	logFoodFor(t, userID, addDaysUTC(today, -5), 450)

	code, analysis, body := getWeeklyAnalysis(t, "wife@example.com", "?from="+from+"&to="+today)
	if code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", code, body)
	}
	if len(analysis.DailyData) != 7 || analysis.DailyData[0].Date != from {
		t.Fatalf("window = %s..%s with %d days, want %s..%s with 7",
			analysis.StartDate, analysis.EndDate, len(analysis.DailyData), from, today)
	}
	for _, day := range analysis.DailyData {
		if day.Date == addDaysUTC(today, -5) {
			if day.Calories != 450 {
				t.Errorf("calories on %s = %v, want 450 — a day before the bank start must not be dropped or zeroed",
					day.Date, day.Calories)
			}
			return
		}
	}
	t.Fatalf("no row for %s", addDaysUTC(today, -5))
}
