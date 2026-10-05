package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"cals/internal/database"
	"cals/internal/models"
)

// A brand-new account gets the additive default of 7 weigh-ins for the trend
// window (decision 95), it is stored, and GET /api/users/me exposes it — the
// chart reads the window from the user record rather than hard-coding 7.
func TestNewAccountDefaultsToTheSevenWeighInTrendWindow(t *testing.T) {
	setupHandlerDB(t)

	created, err := GetOrCreateUser("newcomer@example.com")
	if err != nil {
		t.Fatalf("GetOrCreateUser: %v", err)
	}
	if created.WeightTrendDays != 7 {
		t.Errorf("new user weight_trend_days = %d, want 7", created.WeightTrendDays)
	}

	var stored int
	if err := database.DB.QueryRow(`SELECT weight_trend_days FROM users WHERE email = ?`, "newcomer@example.com").Scan(&stored); err != nil {
		t.Fatalf("reading stored trend window: %v", err)
	}
	if stored != 7 {
		t.Errorf("stored weight_trend_days = %d, want the migration default 7", stored)
	}

	recorder := httptest.NewRecorder()
	HandleGetCurrentUser(recorder, authedRequest(t, http.MethodGet, "/api/users/me", "", "newcomer@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/users/me status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var fetched models.User
	if err := json.NewDecoder(recorder.Body).Decode(&fetched); err != nil {
		t.Fatalf("decoding user: %v", err)
	}
	if fetched.WeightTrendDays != 7 {
		t.Errorf("GET weight_trend_days = %d, want 7", fetched.WeightTrendDays)
	}
}

// PUT /api/users/me sets the trend window (decision 95: no UI until Phase 15,
// but it must be readable and writable), and windows that could never be drawn
// — below three weigh-ins or beyond the longest range the metrics endpoints
// return — are errors rather than silent no-ops.
func TestUpdateCurrentUserWeightTrendDays(t *testing.T) {
	setupHandlerDB(t)

	email := "wife@example.com"
	createTestUser(t, email, "2026-09-01", 2000)

	set := func(days int) *httptest.ResponseRecorder {
		t.Helper()
		body := `{"weight_trend_days": ` + strconv.Itoa(days) + `}`
		recorder := httptest.NewRecorder()
		HandleUpdateCurrentUser(recorder, authedRequest(t, http.MethodPut, "/api/users/me", body, email))
		return recorder
	}

	recorder := set(10)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT weight_trend_days=10 status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var updated models.User
	if err := json.NewDecoder(recorder.Body).Decode(&updated); err != nil {
		t.Fatalf("decoding updated user: %v", err)
	}
	if updated.WeightTrendDays != 10 {
		t.Errorf("response weight_trend_days = %d, want 10", updated.WeightTrendDays)
	}

	// The value is persisted, not just echoed.
	stored := storedTrendWindow(t, email)
	if stored != 10 {
		t.Errorf("stored weight_trend_days = %d, want 10", stored)
	}

	// Two weigh-ins can never draw a trend, so 2 is rejected and 3 is accepted.
	if recorder = set(2); recorder.Code != http.StatusBadRequest {
		t.Errorf("PUT weight_trend_days=2 status = %d, want 400", recorder.Code)
	}
	if stored = storedTrendWindow(t, email); stored != 10 {
		t.Errorf("stored weight_trend_days = %d after a rejected update, want the previous 10", stored)
	}
	if recorder = set(3); recorder.Code != http.StatusOK {
		t.Errorf("PUT weight_trend_days=3 status = %d, want 200", recorder.Code)
	}

	// Beyond the longest metrics range the column could only mislead.
	if recorder = set(91); recorder.Code != http.StatusBadRequest {
		t.Errorf("PUT weight_trend_days=91 status = %d, want 400", recorder.Code)
	}
	if stored = storedTrendWindow(t, email); stored != 3 {
		t.Errorf("stored weight_trend_days = %d after a rejected update, want the previous 3", stored)
	}
}

func storedTrendWindow(t *testing.T, email string) int {
	t.Helper()
	var stored int
	if err := database.DB.QueryRow(`SELECT weight_trend_days FROM users WHERE email = ?`, email).Scan(&stored); err != nil {
		t.Fatalf("reading stored trend window: %v", err)
	}
	return stored
}
