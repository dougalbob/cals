package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"cals/internal/database"
	"cals/internal/models"
)

// Slice 14.4 — the body-map measurement picker (decision 67).
//
// Pinned here:
//   - the wire shape is a plain number or null for every part (it used to be
//     a raw sql.NullFloat64 object, which no client type ever matched),
//   - committing one part can never wipe the others recorded the same day
//     (decision 96 replaced delete-then-insert with a per-part merge),
//   - PUT /api/measurements/{id} patches one entry without touching the rest
//     of it, so "correct last month's waist" no longer invents a measurement,
//   - the latest-per-part lookup survives histories longer than the list's
//     20-row window,
//   - the list endpoint keeps V1's exact no-parameter contract while gaining
//     the slice-14.1 from/to window contract,
//   - users.body_outline round-trips through PUT /api/users/me (decision 97).

func postMeasurement(t *testing.T, email, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleCreateMeasurement(recorder, authedRequest(t, http.MethodPost, "/api/measurements", body, email))
	return recorder
}

func putMeasurement(t *testing.T, email string, id int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := authedRequest(t, http.MethodPut, fmt.Sprintf("/api/measurements/%d", id), body, email)
	req.SetPathValue("id", fmt.Sprintf("%d", id))
	recorder := httptest.NewRecorder()
	HandleUpdateMeasurement(recorder, req)
	return recorder
}

func getMeasurements(t *testing.T, email, query string) (int, []models.MeasurementEntry) {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetMeasurements(recorder, authedRequest(t, http.MethodGet, "/api/measurements"+query, "", email))
	if recorder.Code != http.StatusOK {
		return recorder.Code, nil
	}
	var entries []models.MeasurementEntry
	if err := json.NewDecoder(recorder.Body).Decode(&entries); err != nil {
		t.Fatalf("decoding measurements: %v", err)
	}
	return recorder.Code, entries
}

func getMeasurementLatest(t *testing.T, email string) MeasurementLatest {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetLatestMeasurements(recorder, authedRequest(t, http.MethodGet, "/api/measurements/latest", "", email))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/measurements/latest status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var latest MeasurementLatest
	if err := json.NewDecoder(recorder.Body).Decode(&latest); err != nil {
		t.Fatalf("decoding latest measurements: %v", err)
	}
	return latest
}

// The wire shape is the contract React's types declare: a plain number or
// null per part. Before this slice the handler serialised sql.NullFloat64 as
// {"Float64": 98.2, "Valid": true}, and the rc28 Metrics screen crashed on it
// against the real server.
func TestMeasurementWireShapeIsNumberOrNull(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "map@example.com", "2026-09-01", 2000)

	recorder := postMeasurement(t, "map@example.com", `{"date":"2026-10-01","waist_cm":98.2}`)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("POST status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	HandleGetMeasurements(recorder, authedRequest(t, http.MethodGet, "/api/measurements", "", "map@example.com"))

	var rows []map[string]json.RawMessage
	if err := json.NewDecoder(recorder.Body).Decode(&rows); err != nil {
		t.Fatalf("decoding raw measurements: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}

	for _, part := range []string{"waist_cm", "hips_cm", "bust_cm", "chest_cm", "upper_arm_cm", "thigh_cm", "neck_cm"} {
		raw := strings.TrimSpace(string(rows[0][part]))
		if part == "waist_cm" {
			if raw != "98.2" {
				t.Errorf("waist_cm = %s, want the plain number 98.2", raw)
			}
			continue
		}
		if raw != "null" {
			t.Errorf("%s = %s, want null (a missing part is absent, not zero and not an object)", part, raw)
		}
	}
}

// Decision 96's core guarantee: committing one part merges into the day's row
// instead of deleting it. Verified live before the fix: posting hips for a
// date that already had a waist silently deleted the waist.
func TestPostingOnePartPreservesTheOthersRecordedThatDay(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "map@example.com", "2026-09-01", 2000)

	if recorder := postMeasurement(t, "map@example.com", `{"date":"2026-10-01","waist_cm":98.2,"neck_cm":40.1}`); recorder.Code != http.StatusCreated {
		t.Fatalf("first POST status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if recorder := postMeasurement(t, "map@example.com", `{"date":"2026-10-01","hips_cm":103.4}`); recorder.Code != http.StatusOK {
		t.Fatalf("second POST status = %d, body = %s (merging into today's row is an update, not a create)", recorder.Code, recorder.Body.String())
	}

	_, entries := getMeasurements(t, "map@example.com", "")
	if len(entries) != 1 {
		t.Fatalf("entries = %d, want exactly one row for the date", len(entries))
	}
	entry := entries[0]
	if entry.WaistCM == nil || *entry.WaistCM != 98.2 {
		t.Errorf("waist_cm = %v, want 98.2 to survive the hips save", entry.WaistCM)
	}
	if entry.NeckCM == nil || *entry.NeckCM != 40.1 {
		t.Errorf("neck_cm = %v, want 40.1 to survive the hips save", entry.NeckCM)
	}
	if entry.HipsCM == nil || *entry.HipsCM != 103.4 {
		t.Errorf("hips_cm = %v, want 103.4", entry.HipsCM)
	}

	// Re-posting a part overwrites that part alone.
	postMeasurement(t, "map@example.com", `{"date":"2026-10-01","waist_cm":97.9}`)
	_, entries = getMeasurements(t, "map@example.com", "")
	if len(entries) != 1 {
		t.Fatalf("entries = %d after re-posting, want still one row", len(entries))
	}
	if entries[0].WaistCM == nil || *entries[0].WaistCM != 97.9 {
		t.Errorf("waist_cm = %v, want the re-posted 97.9", entries[0].WaistCM)
	}
	if entries[0].HipsCM == nil || *entries[0].HipsCM != 103.4 {
		t.Errorf("hips_cm = %v, want 103.4 untouched by the waist re-post", entries[0].HipsCM)
	}
}

func TestCreateMeasurementValidatesItsInput(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "map@example.com", "2026-09-01", 2000)

	cases := []struct {
		name string
		body string
	}{
		{"no parts", `{"date":"2026-10-01"}`},
		{"zero is not a measurement", `{"date":"2026-10-01","waist_cm":0}`},
		{"negative is not a measurement", `{"date":"2026-10-01","waist_cm":-2}`},
		{"malformed date", `{"date":"01/10/2026","waist_cm":98}`},
		{"missing date", `{"waist_cm":98}`},
	}
	for _, tc := range cases {
		if recorder := postMeasurement(t, "map@example.com", tc.body); recorder.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", tc.name, recorder.Code)
		}
	}

	var count int
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM measurement_entries`).Scan(&count)
	if count != 0 {
		t.Errorf("rows written by invalid posts = %d, want 0", count)
	}
}

// Decision 96: correcting an old entry edits that entry — its date and its
// other parts stay exactly as recorded.
func TestUpdateMeasurementPatchesOnePartOnly(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "map@example.com", "2026-09-01", 2000)
	postMeasurement(t, "map@example.com", `{"date":"2026-09-12","waist_cm":99.4,"chest_cm":108.0,"neck_cm":40.0}`)

	_, entries := getMeasurements(t, "map@example.com", "")
	if len(entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(entries))
	}

	recorder := putMeasurement(t, "map@example.com", entries[0].ID, `{"waist_cm":98.9}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var updated models.MeasurementEntry
	if err := json.NewDecoder(recorder.Body).Decode(&updated); err != nil {
		t.Fatalf("decoding updated entry: %v", err)
	}
	if updated.WaistCM == nil || *updated.WaistCM != 98.9 {
		t.Errorf("waist_cm = %v, want 98.9", updated.WaistCM)
	}
	if updated.ChestCM == nil || *updated.ChestCM != 108.0 {
		t.Errorf("chest_cm = %v, want 108.0 untouched", updated.ChestCM)
	}
	if updated.NeckCM == nil || *updated.NeckCM != 40.0 {
		t.Errorf("neck_cm = %v, want 40.0 untouched", updated.NeckCM)
	}
	if updated.Date != "2026-09-12" {
		t.Errorf("date = %s, want the entry's own 2026-09-12 — a correction must not move it", updated.Date)
	}

	// The list agrees with the patch.
	_, entries = getMeasurements(t, "map@example.com", "")
	if len(entries) != 1 || entries[0].WaistCM == nil || *entries[0].WaistCM != 98.9 {
		t.Errorf("list after PUT = %+v, want the single patched row", entries)
	}
}

func TestUpdateMeasurementClearsAndMovesAndRejects(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "map@example.com", "2026-09-01", 2000)
	otherID := createTestUser(t, "other@example.com", "2026-09-01", 2000)

	postMeasurement(t, "map@example.com", `{"date":"2026-09-12","waist_cm":99.4,"neck_cm":40.0}`)
	_, entries := getMeasurements(t, "map@example.com", "")
	entryID := entries[0].ID

	// Explicit null clears one part and nothing else.
	if recorder := putMeasurement(t, "map@example.com", entryID, `{"neck_cm":null}`); recorder.Code != http.StatusOK {
		t.Fatalf("clear status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	_, entries = getMeasurements(t, "map@example.com", "")
	if entries[0].NeckCM != nil {
		t.Errorf("neck_cm = %v, want cleared", entries[0].NeckCM)
	}
	if entries[0].WaistCM == nil || *entries[0].WaistCM != 99.4 {
		t.Errorf("waist_cm = %v, want 99.4 to survive the neck clear", entries[0].WaistCM)
	}

	// The whole entry can move to its true date.
	if recorder := putMeasurement(t, "map@example.com", entryID, `{"date":"2026-09-11"}`); recorder.Code != http.StatusOK {
		t.Fatalf("move status = %d", recorder.Code)
	}
	_, entries = getMeasurements(t, "map@example.com", "")
	if entries[0].Date != "2026-09-11" {
		t.Errorf("date = %s, want 2026-09-11", entries[0].Date)
	}

	rejections := []struct {
		name string
		body string
	}{
		{"zero value", `{"waist_cm":0}`},
		{"negative value", `{"waist_cm":-1}`},
		{"unknown field", `{"height_cm":180}`},
		{"empty body", `{}`},
		{"malformed date", `{"date":"yesterday"}`},
	}
	for _, tc := range rejections {
		if recorder := putMeasurement(t, "map@example.com", entryID, tc.body); recorder.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", tc.name, recorder.Code)
		}
	}

	// Nobody can patch somebody else's entry — and there is nothing to find.
	if recorder := putMeasurement(t, "other@example.com", entryID, `{"waist_cm":50}`); recorder.Code != http.StatusNotFound {
		t.Errorf("another user's PUT status = %d, want 404", recorder.Code)
	}
	if recorder := putMeasurement(t, "map@example.com", otherID+9999, `{"waist_cm":50}`); recorder.Code != http.StatusNotFound {
		t.Errorf("unknown id status = %d, want 404", recorder.Code)
	}
}

// "The last value for this part" is the newest non-null value — not the
// newest row, and not whatever survives the list's 20-row window.
func TestLatestMeasurementsSurviveTheTwentyRowWindow(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "map@example.com", "2026-01-01", 2000)

	// The oldest session recorded a thigh and nothing since has — 25 waist-only
	// sessions later, a naive "newest 20 rows" lookup can no longer see it.
	if _, err := database.DB.Exec(`
		INSERT INTO measurement_entries (user_id, date, thigh_cm) VALUES (?, '2026-01-05', 58.7)
	`, userID); err != nil {
		t.Fatalf("inserting oldest row: %v", err)
	}
	for i := 0; i < 25; i++ {
		date := time.Date(2026, 2, 1+i, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		if _, err := database.DB.Exec(`
			INSERT INTO measurement_entries (user_id, date, waist_cm) VALUES (?, ?, ?)
		`, userID, date, 100-float64(i)*0.2); err != nil {
			t.Fatalf("inserting waist row %d: %v", i, err)
		}
	}

	latest := getMeasurementLatest(t, "map@example.com")
	if latest.ThighCM == nil || latest.ThighCM.Value != 58.7 || latest.ThighCM.Date != "2026-01-05" {
		t.Errorf("thigh latest = %+v, want the 2026-01-05 58.7 the 20-row window hides", latest.ThighCM)
	}
	if latest.WaistCM == nil || latest.WaistCM.Value != 95.2 || latest.WaistCM.Date != "2026-02-25" {
		t.Errorf("waist latest = %+v, want 95.2 on 2026-02-25", latest.WaistCM)
	}
	if latest.WaistCM.Previous == nil || latest.WaistCM.Previous.Value != 95.4 || latest.WaistCM.Previous.Date != "2026-02-24" {
		t.Errorf("waist previous = %+v, want 95.4 on 2026-02-24", latest.WaistCM.Previous)
	}
	if latest.BustCM != nil || latest.ChestCM != nil || latest.NeckCM != nil || latest.HipsCM != nil || latest.UpperArmCM != nil {
		t.Errorf("never-measured parts = %+v, want all null", latest)
	}

	// And the value-before is one level deep only.
	if latest.WaistCM.Previous.Previous != nil {
		t.Errorf("previous.previous = %+v, want null", latest.WaistCM.Previous.Previous)
	}
}

// No parameters: exactly V1's contract, the newest 20 rows whatever their
// age. The body map's table asks for a window instead.
func TestGetMeasurementsLegacyLimitIsUnchanged(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "map@example.com", "2025-01-01", 2000)

	today := time.Now().UTC()
	day := func(back int) string { return today.AddDate(0, 0, -back).Format("2006-01-02") }

	// One ancient row, then 22 recent ones: the ancient row must stay absent
	// from the legacy response (only 20 fit) while a windowed request can
	// still reach it.
	if _, err := database.DB.Exec(`
		INSERT INTO measurement_entries (user_id, date, waist_cm) VALUES (?, ?, 120.0)
	`, userID, day(500)); err != nil {
		t.Fatalf("inserting ancient row: %v", err)
	}
	for i := 21; i >= 0; i-- {
		if _, err := database.DB.Exec(`
			INSERT INTO measurement_entries (user_id, date, waist_cm) VALUES (?, ?, 100)
		`, userID, day(i)); err != nil {
			t.Fatalf("inserting row %d: %v", i, err)
		}
	}

	_, entries := getMeasurements(t, "map@example.com", "")
	if len(entries) != 20 {
		t.Fatalf("entries = %d, want the unchanged 20-row limit", len(entries))
	}
	if entries[0].Date != day(0) {
		t.Errorf("newest = %s, want %s first", entries[0].Date, day(0))
	}
	for _, entry := range entries {
		if entry.Date == day(500) {
			t.Error("ancient row leaked into the legacy 20-row response")
		}
	}

	// The windowed contract reaches the ancient row, and shares the other
	// series endpoints' validation.
	_, windowed := getMeasurements(t, "map@example.com", "?from="+day(520)+"&to="+day(480))
	if len(windowed) != 1 || windowed[0].Date != day(500) {
		t.Errorf("windowed = %+v, want the ancient row alone", windowed)
	}

	_, daysWindow := getMeasurements(t, "map@example.com", "?days=7")
	if len(daysWindow) != 7 {
		t.Errorf("days=7 returned %d rows, want 7", len(daysWindow))
	}

	for _, bad := range []string{"?from=2026-09-01", "?from=not-a-date&to=2026-09-30", "?from=2026-09-30&to=2026-09-01", "?from=2025-01-01&to=2026-09-30"} {
		if code, _ := getMeasurements(t, "map@example.com", bad); code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", bad, code)
		}
	}
}

// Decision 97: the outline preference lives on the user record, written
// through PUT /api/users/me, validated, and readable back.
func TestBodyOutlinePreferenceRoundTrips(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "map@example.com", "2026-09-01", 2000)

	getUser := func() map[string]json.RawMessage {
		t.Helper()
		recorder := httptest.NewRecorder()
		HandleGetCurrentUser(recorder, authedRequest(t, http.MethodGet, "/api/users/me", "", "map@example.com"))
		var user map[string]json.RawMessage
		if err := json.NewDecoder(recorder.Body).Decode(&user); err != nil {
			t.Fatalf("decoding user: %v", err)
		}
		return user
	}

	if raw := strings.TrimSpace(string(getUser()["body_outline"])); raw != "null" {
		t.Fatalf("body_outline before choosing = %s, want null", raw)
	}

	recorder := httptest.NewRecorder()
	HandleUpdateCurrentUser(recorder, authedRequest(t, http.MethodPut, "/api/users/me", `{"body_outline":"female"}`, "map@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT body_outline status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if raw := strings.TrimSpace(string(getUser()["body_outline"])); raw != `"female"` {
		t.Errorf("body_outline after choosing = %s, want \"female\"", raw)
	}

	// A preference set on one field survives an unrelated update.
	recorder = httptest.NewRecorder()
	HandleUpdateCurrentUser(recorder, authedRequest(t, http.MethodPut, "/api/users/me", `{"daily_calorie_goal":1800}`, "map@example.com"))
	if raw := strings.TrimSpace(string(getUser()["body_outline"])); raw != `"female"` {
		t.Errorf("body_outline after unrelated update = %s, want \"female\" kept", raw)
	}

	for _, invalid := range []string{`{"body_outline":"other"}`, `{"body_outline":""}`} {
		recorder = httptest.NewRecorder()
		HandleUpdateCurrentUser(recorder, authedRequest(t, http.MethodPut, "/api/users/me", invalid, "map@example.com"))
		if recorder.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", invalid, recorder.Code)
		}
	}
}
