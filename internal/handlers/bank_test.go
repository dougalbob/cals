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
	"cals/internal/models"
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

// createTestUserWithWindow inserts a user with an explicit bank window too.
// createTestUser keeps the column at its additive default of 14, which is what
// an un-migrated account gets (decision 93).
func createTestUserWithWindow(t *testing.T, email, bankStart string, goal, windowDays int) int64 {
	t.Helper()
	result, err := database.DB.Exec(`
		INSERT INTO users (email, name, daily_calorie_goal, daily_water_goal_ml, bank_start_date, bank_window_days)
		VALUES (?, '', ?, 2000, ?, ?)
	`, email, goal, bankStart, windowDays)
	if err != nil {
		t.Fatalf("inserting user: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("user id: %v", err)
	}
	return id
}

// assertBankWindow checks the additive audit fields, which are what make a
// windowed figure labelable ("Last 14 days") and inspectable ("12 of 14 days
// counted") — decision 92.
func assertBankWindow(t *testing.T, bank BankResponse, wantDays int, wantStart string, wantCounted, wantUnlogged int) {
	t.Helper()
	if bank.WindowDays != wantDays {
		t.Errorf("WindowDays = %d, want %d", bank.WindowDays, wantDays)
	}
	if bank.WindowStartDate != wantStart {
		t.Errorf("WindowStartDate = %q, want %q", bank.WindowStartDate, wantStart)
	}
	if bank.DaysCounted != wantCounted {
		t.Errorf("DaysCounted = %d, want %d", bank.DaysCounted, wantCounted)
	}
	if bank.DaysUnlogged != wantUnlogged {
		t.Errorf("DaysUnlogged = %d, want %d", bank.DaysUnlogged, wantUnlogged)
	}
}

// The window is the previous N completed calendar days: the day N days back is
// inside it, the day N+1 days back is not, and the as-of date itself is never
// counted because today is always in progress (decisions 66, 92).
func TestBankWindowCountsExactlyThePreviousNCompletedDays(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUserWithWindow(t, "wife@example.com", "2026-09-01", 1000, 3)
	logFoodFor(t, userID, "2026-09-04", 100) // one day before the window opens
	logFoodFor(t, userID, "2026-09-05", 200) // the window's first day
	logFoodFor(t, userID, "2026-09-07", 300) // the window's last day
	logFoodFor(t, userID, "2026-09-08", 900) // the as-of date: excluded

	// Window for 8 September with N = 3: the 5th, 6th and 7th. Only the 5th and
	// 7th have logging, so 2 × 1000 − 500 = 1500.
	bank := getBank(t, "wife@example.com", "2026-09-08")
	if bank.BankBalance != 1500 {
		t.Errorf("BankBalance = %d, want 1500 (the 4th and 8th must not count)", bank.BankBalance)
	}
	assertBankWindow(t, bank, 3, "2026-09-05", 2, 1)

	// One day earlier the window shifts with it, so the 4th is now the first
	// day: 2 × 1000 − 300 = 1700.
	earlier := getBank(t, "wife@example.com", "2026-09-07")
	if earlier.BankBalance != 1700 {
		t.Errorf("BankBalance for 7 Sept = %d, want 1700 (the 4th is inside this window)", earlier.BankBalance)
	}
	assertBankWindow(t, earlier, 3, "2026-09-04", 2, 1)
}

// A window shorter than the logged history must ignore the older days rather
// than accumulate them (decision 66).
func TestBankWindowShorterThanHistoryUsesOnlyTheWindow(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUserWithWindow(t, "wife@example.com", "2026-09-01", 1000, 2)
	for _, date := range []string{"2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"} {
		logFoodFor(t, userID, date, 500)
	}

	// Window for 6 September with N = 2: the 4th and 5th. 2 × 1000 − 1000 = 1000.
	// The since-day-one accumulation this replaces would have said
	// 5 × 1000 − 2500 = 2500.
	bank := getBank(t, "wife@example.com", "2026-09-06")
	if bank.BankBalance != 1000 {
		t.Errorf("BankBalance = %d, want 1000 (only the 4th and 5th count)", bank.BankBalance)
	}
	assertBankWindow(t, bank, 2, "2026-09-04", 2, 0)
}

// A window that reaches past bank_start_date is clipped at the start date: it
// cannot borrow days from before the bank began (decision 66), and the audit
// fields still report the configured window length.
func TestBankWindowStopsAtTheBankStartDate(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUserWithWindow(t, "wife@example.com", "2026-09-25", 1500, 14)
	// Three logged days of the five the floor leaves: the 26th and 28th are a
	// wash (decision 42), so the budget accrues three times, not five.
	for _, date := range []string{"2026-09-25", "2026-09-27", "2026-09-29"} {
		logFoodFor(t, userID, date, 1000)
	}

	// The 14-day window would open on the 16th; the bank started on the 25th,
	// so five days are eligible: 3 × 1500 − 3000 = 1500.
	bank := getBank(t, "wife@example.com", "2026-09-30")
	if bank.BankBalance != 1500 {
		t.Errorf("BankBalance = %d, want 1500 (three logged days, floored at the start date)", bank.BankBalance)
	}
	assertBankWindow(t, bank, 14, "2026-09-25", 3, 2)
}

// Decision 42: a day with no logging at all is a wash — it contributes neither
// the day's budget nor its spend. Before this slice every day inside the window
// added a full day's budget.
func TestBankExcludesUnloggedDaysInsideTheWindow(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUserWithWindow(t, "husband@example.com", "2026-09-01", 1000, 5)
	logFoodFor(t, userID, "2026-09-05", 1200)
	logFoodFor(t, userID, "2026-09-07", 900)

	// Window for 10 September with N = 5: the 5th to the 9th. Two logged days
	// (5th, 7th): 2 × 1000 − 2100 = −100. The other three days are free of both
	// budget and spend; counting their budgets would have said 2900.
	bank := getBank(t, "husband@example.com", "2026-09-10")
	if bank.BankBalance != -100 {
		t.Errorf("BankBalance = %d, want -100 (unlogged days add no budget)", bank.BankBalance)
	}
	assertBankWindow(t, bank, 5, "2026-09-05", 2, 3)
}

// Food and drink land in the same day's total, and that day contributes once
// (decision 1: drink calories count towards the bank).
func TestBankWindowCountsFoodAndDrinksOnTheSameDay(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUserWithWindow(t, "wife@example.com", "2026-09-01", 1000, 3)
	logFoodFor(t, userID, "2026-09-01", 400) // outside the three-day window
	logFoodFor(t, userID, "2026-09-08", 500)
	logDrinkFor(t, userID, "2026-09-08", 150)

	// Window for 10 September with N = 3: the 7th to the 9th. One logged day,
	// where food and drink share a single day's budget:
	// 1000 − 500 − 150 = 350.
	bank := getBank(t, "wife@example.com", "2026-09-10")
	if bank.BankBalance != 350 {
		t.Errorf("BankBalance = %d, want 350 (1000 − 500 food − 150 drink)", bank.BankBalance)
	}
	assertBankWindow(t, bank, 3, "2026-09-07", 1, 2)
}

// Decision 91: the "all time" preset (window_days = 0) drops the length limit
// but still excludes unlogged days, so it is not the old cumulative figure for
// anyone who skips days.
func TestBankAllTimePresetExcludesUnloggedDays(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUserWithWindow(t, "wife@example.com", "2026-09-01", 1200, 0)
	logFoodFor(t, userID, "2026-09-01", 1000)
	logFoodFor(t, userID, "2026-09-09", 1000)

	// Window: 1st to 9th (9 days), two of them logged: 2 × 1200 − 2000 = 400.
	// The old cumulative rule credited nine days of budget: 9 × 1200 − 2000 = 8800.
	bank := getBank(t, "wife@example.com", "2026-09-10")
	if bank.BankBalance != 400 {
		t.Errorf("BankBalance = %d, want 400 (all time still excludes unlogged days)", bank.BankBalance)
	}
	assertBankWindow(t, bank, 0, "2026-09-01", 2, 7)
}

// today_available is the daily goal plus the windowed balance, so it moves with
// the window the user has configured (decision 66).
func TestBankTodayAvailableMovesWithTheWindow(t *testing.T) {
	setupHandlerDB(t)

	log := func(userID int64) {
		logFoodFor(t, userID, "2026-09-06", 100)
		logFoodFor(t, userID, "2026-09-08", 200)
		logFoodFor(t, userID, "2026-09-09", 300)
	}

	shortID := createTestUserWithWindow(t, "wife@example.com", "2026-09-01", 1000, 2)
	log(shortID)
	longID := createTestUserWithWindow(t, "husband@example.com", "2026-09-01", 1000, 0)
	log(longID)

	// N = 2: the 8th and 9th, both logged: 2000 − 500 = 1500.
	short := getBank(t, "wife@example.com", "2026-09-10")
	if short.BankBalance != 1500 || short.TodayAvailable != 2500 {
		t.Errorf("N=2: balance %d, today_available %d; want 1500 and 2500", short.BankBalance, short.TodayAvailable)
	}
	if short.TodayAvailable != short.DailyGoal+short.BankBalance {
		t.Errorf("today_available = %d, want daily_goal + bank_balance = %d", short.TodayAvailable, short.DailyGoal+short.BankBalance)
	}

	// All time: the 6th, 8th and 9th: 3000 − 600 = 2400.
	long := getBank(t, "husband@example.com", "2026-09-10")
	if long.BankBalance != 2400 || long.TodayAvailable != 3400 {
		t.Errorf("all time: balance %d, today_available %d; want 2400 and 3400", long.BankBalance, long.TodayAvailable)
	}
	if long.BankBalance == short.BankBalance {
		t.Error("the balance did not move when the window changed; today_available is not windowed")
	}
}

// The additive fields are present even when there is no window to compute: an
// as-of date on the bank's first day, and an account with no bank started.
func TestBankWindowFieldsWithNoWindowYet(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUserWithWindow(t, "wife@example.com", "2026-09-30", 1500, 7)

	bank := getBank(t, "wife@example.com", "2026-09-30")
	if bank.BankBalance != 0 || bank.TodayAvailable != 1500 {
		t.Errorf("as-of the start date: balance %d, today_available %d; want 0 and 1500", bank.BankBalance, bank.TodayAvailable)
	}
	assertBankWindow(t, bank, 7, "2026-09-30", 0, 0)

	if _, err := database.DB.Exec(`UPDATE users SET bank_start_date = NULL WHERE id = ?`, userID); err != nil {
		t.Fatalf("clearing bank start date: %v", err)
	}
	noStart := getBank(t, "wife@example.com", "2026-09-30")
	if noStart.BankBalance != 0 || noStart.TodayAvailable != 1500 {
		t.Errorf("no start date: balance %d, today_available %d; want 0 and 1500", noStart.BankBalance, noStart.TodayAvailable)
	}
	if noStart.StartDate != "" || noStart.WindowStartDate != "" {
		t.Errorf("no start date: start_date %q, window_start_date %q; want both empty", noStart.StartDate, noStart.WindowStartDate)
	}
	assertBankWindow(t, noStart, 7, "", 0, 0)
}

// A day counts as logged when either ledger has an entry for it, even when the
// entry carries no calories — a logged glass of water is still logging. This is
// the literal reading of decision 42 ("a day with no logging at all"): the two
// ledgers in scope are the bank's own, food and drinks.
func TestBankCountsADayWithOnlyAZeroCalorieDrink(t *testing.T) {
	setupHandlerDB(t)

	userID := createTestUserWithWindow(t, "wife@example.com", "2026-09-01", 1000, 2)
	water := insertDrink(t, userID, "Water", "💧", 250, 0, true)
	if _, err := database.DB.Exec(`
		INSERT INTO drink_entries (user_id, drink_id, date, volume_ml, calories)
		VALUES (?, ?, '2026-09-08', 250, 0)
	`, userID, water); err != nil {
		t.Fatalf("inserting drink entry: %v", err)
	}

	// Window for 10 September with N = 2: the 8th (logged, zero calories) and
	// the 9th (unlogged). 1 × 1000 − 0 = 1000.
	bank := getBank(t, "wife@example.com", "2026-09-10")
	if bank.BankBalance != 1000 {
		t.Errorf("BankBalance = %d, want 1000 (a zero-calorie logged day still counts)", bank.BankBalance)
	}
	assertBankWindow(t, bank, 2, "2026-09-08", 1, 1)
}

// The metrics series is a mirror of /api/bank, not a second implementation:
// every row must equal GET /api/bank?date=<row date + 1> (decisions 66, 42).
func TestBankStatsSeriesMatchesTheBankEndpoint(t *testing.T) {
	setupHandlerDB(t)

	email := "wife@example.com"
	userID := createTestUserWithWindow(t, email, "2026-09-01", 1000, 3)
	logFoodFor(t, userID, "2026-09-04", 100)
	logFoodFor(t, userID, "2026-09-05", 200)
	logFoodFor(t, userID, "2026-09-07", 300)
	logDrinkFor(t, userID, "2026-09-08", 50)

	code, stats := getBankStats(t, email, "?from=2026-09-04&to=2026-09-10")
	if code != http.StatusOK {
		t.Fatalf("GET /api/stats/bank status = %d", code)
	}
	if len(stats) == 0 {
		t.Fatal("GET /api/stats/bank returned no rows")
	}

	// A hand-computed anchor, so this is not only "the two agree": the 9th's
	// closing balance is the window for the 10th with N = 3, which holds the
	// 7th (300 kcal food) and the 8th (50 kcal drink): 2 × 1000 − 350 = 1650.
	for _, day := range stats {
		if day.Date == "2026-09-09" && day.Balance != 1650 {
			t.Errorf("stats balance on 2026-09-09 = %v, want 1650", day.Balance)
		}
	}

	for _, day := range stats {
		want := getBank(t, email, addDaysUTC(day.Date, 1)).BankBalance
		if day.Balance != float64(want) {
			t.Errorf("stats balance on %s = %v, want %d (GET /api/bank?date=%s)", day.Date, day.Balance, want, addDaysUTC(day.Date, 1))
		}
	}
}

// The Calendar is the third surface printing the figure, and it must agree with
// /api/bank for the same date: a day's cell is the bank as of the next morning.
// Fractional calories are included so the shared rounding is exercised too.
func TestCalendarBankMatchesTheBankEndpoint(t *testing.T) {
	setupHandlerDB(t)

	email := "husband@example.com"
	userID := createTestUserWithWindow(t, email, "2026-09-01", 1500, 4)
	logFoodFor(t, userID, "2026-09-02", 700)
	logFoodFor(t, userID, "2026-09-05", 333.5)
	logDrinkFor(t, userID, "2026-09-05", 150)
	logFoodFor(t, userID, "2026-09-08", 1800)
	logFoodFor(t, userID, "2026-09-09", 200)

	response := getCalendarRange(t, email, "2026-09-01", "2026-09-12")
	if response.BankWindowDays != 4 {
		t.Errorf("calendar bank_window_days = %d, want 4", response.BankWindowDays)
	}

	// A hand-computed anchor as well as the mirror check below: the 9th's
	// closing balance is the window for the 10th with N = 4, which holds the
	// 8th (1800 kcal) and the 9th (200 kcal): 2 × 1500 − 2000 = 1000.
	if anchor := calendarDay(t, response, "2026-09-09"); anchor.BankBalance != 1000 {
		t.Errorf("calendar balance on 2026-09-09 = %d, want 1000", anchor.BankBalance)
	}

	for _, day := range response.Days {
		want := getBank(t, email, addDaysUTC(day.Date, 1)).BankBalance
		if day.BankBalance != want {
			t.Errorf("calendar balance on %s = %d, want %d (GET /api/bank?date=%s)", day.Date, day.BankBalance, want, addDaysUTC(day.Date, 1))
		}
	}
}

// PUT /api/users/me sets the window (decision 93: no UI, but it must be
// readable and writable), and a negative value is rejected rather than silently
// ignored. 0 is a real value — the all-time preset.
func TestUpdateCurrentUserBankWindowDays(t *testing.T) {
	setupHandlerDB(t)

	email := "wife@example.com"
	createTestUserWithWindow(t, email, "2026-09-01", 1000, 3)

	recorder := httptest.NewRecorder()
	HandleUpdateCurrentUser(recorder, authedRequest(t, http.MethodPut, "/api/users/me", `{"bank_window_days": 7}`, email))
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT /api/users/me status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var updated models.User
	if err := json.NewDecoder(recorder.Body).Decode(&updated); err != nil {
		t.Fatalf("decoding updated user: %v", err)
	}
	if updated.BankWindowDays != 7 {
		t.Errorf("response bank_window_days = %d, want 7", updated.BankWindowDays)
	}
	if bank := getBank(t, email, "2026-09-10"); bank.WindowDays != 7 {
		t.Errorf("GET /api/bank window_days = %d, want the new 7", bank.WindowDays)
	}

	// 0 is accepted and means "all time".
	recorder = httptest.NewRecorder()
	HandleUpdateCurrentUser(recorder, authedRequest(t, http.MethodPut, "/api/users/me", `{"bank_window_days": 0}`, email))
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT bank_window_days=0 status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if bank := getBank(t, email, "2026-09-10"); bank.WindowDays != 0 {
		t.Errorf("window_days = %d, want 0 (all time)", bank.WindowDays)
	}

	// A negative window is an error, and the stored value must not move.
	recorder = httptest.NewRecorder()
	HandleUpdateCurrentUser(recorder, authedRequest(t, http.MethodPut, "/api/users/me", `{"bank_window_days": -1}`, email))
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("PUT bank_window_days=-1 status = %d, want 400", recorder.Code)
	}
	if bank := getBank(t, email, "2026-09-10"); bank.WindowDays != 0 {
		t.Errorf("window_days = %d after a rejected update, want the previous 0", bank.WindowDays)
	}
}

// A brand-new account gets the additive default of 14 days (decision 93), and
// that value reaches the maths without any further setup.
func TestNewAccountDefaultsToTheFourteenDayWindow(t *testing.T) {
	setupHandlerDB(t)

	created, err := GetOrCreateUser("newcomer@example.com")
	if err != nil {
		t.Fatalf("GetOrCreateUser: %v", err)
	}
	if created.BankWindowDays != 14 {
		t.Errorf("new user bank_window_days = %d, want 14", created.BankWindowDays)
	}

	var stored int
	if err := database.DB.QueryRow(`SELECT bank_window_days FROM users WHERE email = ?`, "newcomer@example.com").Scan(&stored); err != nil {
		t.Fatalf("reading stored window: %v", err)
	}
	if stored != 14 {
		t.Errorf("stored bank_window_days = %d, want the migration default 14", stored)
	}

	bank := getBank(t, "newcomer@example.com", addDaysUTC(created.BankStartDate, 1))
	if bank.WindowDays != 14 {
		t.Errorf("GET /api/bank window_days = %d, want 14", bank.WindowDays)
	}
}
