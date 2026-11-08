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

// The reminders bell's server contract (decisions 121–122). Everything is
// judged against the real clock like the handler, so the fixtures build their
// dates from time.Now() rather than pinning a calendar date.

func reminderToday() string {
	return time.Now().Format("2006-01-02")
}

func daysAgoISO(days int) string {
	return time.Now().AddDate(0, 0, -days).Format("2006-01-02")
}

func getReminders(t *testing.T, email string) (int, models.RemindersResponse) {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetReminders(recorder, authedRequest(t, http.MethodGet, "/api/reminders", "", email))
	if recorder.Code != http.StatusOK {
		return recorder.Code, models.RemindersResponse{}
	}
	var response models.RemindersResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decoding reminders: %v", err)
	}
	return recorder.Code, response
}

func findReminder(t *testing.T, response models.RemindersResponse, itemType string) *models.ReminderItem {
	t.Helper()
	for i := range response.Items {
		if response.Items[i].Type == itemType {
			return &response.Items[i]
		}
	}
	return nil
}

func postReportSeen(t *testing.T, email, body string) (int, models.WeeklyReportSeenResponse) {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleWeeklyReportSeen(recorder, authedRequest(t, http.MethodPost, "/api/reminders/weekly-report-seen", body, email))
	var response models.WeeklyReportSeenResponse
	if recorder.Code == http.StatusOK {
		if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
			t.Fatalf("decoding seen response: %v", err)
		}
	}
	return recorder.Code, response
}

func TestLastCompletedWeekDateMaths(t *testing.T) {
	// Whatever today is, the last completed report period is the previous
	// Monday–Sunday week (decision 121).
	cases := []struct {
		today    string
		wantFrom string
		wantTo   string
	}{
		{"2026-10-05", "2026-09-28", "2026-10-04"}, // Monday: the week that ended yesterday
		{"2026-10-07", "2026-09-28", "2026-10-04"}, // Wednesday mid-week
		{"2026-10-11", "2026-09-28", "2026-10-04"}, // Sunday: current week still in progress
		{"2026-10-12", "2026-10-05", "2026-10-11"}, // the next Monday
		{"2026-01-01", "2025-12-22", "2025-12-28"}, // across a year boundary
	}
	for _, tc := range cases {
		from, to := lastCompletedWeek(tc.today)
		if from != tc.wantFrom || to != tc.wantTo {
			t.Errorf("lastCompletedWeek(%s) = %s…%s, want %s…%s", tc.today, from, to, tc.wantFrom, tc.wantTo)
		}
	}
}

func TestRemindersCadenceItemsFollowTheLoggedData(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "owner@example.com", "2025-01-01", 2000)

	// Nothing recorded at all: both cadence nags are due at once, and the
	// absence is explicit rather than faked as day zero.
	status, response := getReminders(t, "owner@example.com")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	weigh := findReminder(t, response, "weigh_in")
	if weigh == nil {
		t.Fatal("weigh_in reminder missing for a user who has never weighed in")
	}
	if weigh.LastDate != nil || weigh.DaysSince != nil || weigh.CadenceDays != 3 {
		t.Errorf("weigh_in = %+v, want null dates and cadence 3", *weigh)
	}
	measure := findReminder(t, response, "body_measurements")
	if measure == nil {
		t.Fatal("body_measurements reminder missing for a user who has never measured")
	}
	if measure.CadenceDays != 14 {
		t.Errorf("body_measurements cadence = %d, want 14", measure.CadenceDays)
	}

	// Two days ago is inside both windows once logged — only the weigh-in at
	// 2 days clears; a measurement 13 days old is still inside its window.
	if _, err := database.DB.Exec(`INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, ?, ?)`, userID, daysAgoISO(2), 90.0); err != nil {
		t.Fatalf("inserting weigh-in: %v", err)
	}
	if _, err := database.DB.Exec(`INSERT INTO measurement_entries (user_id, date, waist_cm) VALUES (?, ?, ?)`, userID, daysAgoISO(13), 99.0); err != nil {
		t.Fatalf("inserting measurement: %v", err)
	}
	_, response = getReminders(t, "owner@example.com")
	if findReminder(t, response, "weigh_in") != nil {
		t.Error("weigh_in nag survived a weigh-in 2 days ago; it should clear within the 3-day window")
	}
	if findReminder(t, response, "body_measurements") != nil {
		t.Error("body_measurements nag fired 13 days after a session; the window is 14 days")
	}

	// Reaching the window's edge brings the nag back with its arithmetic.
	// Clear the rows first: the reminder judges the *newest* entry.
	if _, err := database.DB.Exec(`DELETE FROM weight_entries WHERE user_id = ?`, userID); err != nil {
		t.Fatalf("clearing weigh-ins: %v", err)
	}
	if _, err := database.DB.Exec(`INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, ?, ?)`, userID, daysAgoISO(3), 90.2); err != nil {
		t.Fatalf("inserting weigh-in: %v", err)
	}
	_, response = getReminders(t, "owner@example.com")
	weigh = findReminder(t, response, "weigh_in")
	if weigh == nil {
		t.Fatal("weigh_in nag missing 3 days after the last weigh-in")
	}
	if weigh.LastDate == nil || *weigh.LastDate != daysAgoISO(3) {
		t.Errorf("weigh_in last_date = %v, want %s", weigh.LastDate, daysAgoISO(3))
	}
	if weigh.DaysSince == nil || *weigh.DaysSince != 3 {
		t.Errorf("weigh_in days_since = %v, want 3", weigh.DaysSince)
	}

	// A measurement session exactly at 14 days is due the same way.
	if _, err := database.DB.Exec(`DELETE FROM measurement_entries WHERE user_id = ?`, userID); err != nil {
		t.Fatalf("clearing measurements: %v", err)
	}
	if _, err := database.DB.Exec(`INSERT INTO measurement_entries (user_id, date, waist_cm) VALUES (?, ?, ?)`, userID, daysAgoISO(14), 98.5); err != nil {
		t.Fatalf("inserting measurement: %v", err)
	}
	_, response = getReminders(t, "owner@example.com")
	measure = findReminder(t, response, "body_measurements")
	if measure == nil {
		t.Fatal("body_measurements nag missing 14 days after the last session")
	}
	if measure.DaysSince == nil || *measure.DaysSince != 14 {
		t.Errorf("body_measurements days_since = %v, want 14", measure.DaysSince)
	}

	// Logging today's session clears the nag — the data is the only dismissal
	// (owner direction 2026-10-07).
	if _, err := database.DB.Exec(`INSERT INTO measurement_entries (user_id, date, waist_cm) VALUES (?, ?, ?)`, userID, reminderToday(), 98.4); err != nil {
		t.Fatalf("inserting measurement: %v", err)
	}
	_, response = getReminders(t, "owner@example.com")
	if findReminder(t, response, "body_measurements") != nil {
		t.Error("body_measurements nag survived a session logged today")
	}
}

func TestRemindersWeeklyReportAdvisoryClearsWhenViewed(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2025-01-01", 2000)
	from, to := lastCompletedWeek(reminderToday())

	status, response := getReminders(t, "owner@example.com")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	report := findReminder(t, response, "weekly_report")
	if report == nil {
		t.Fatal("weekly_report advisory missing before the report has been viewed")
	}
	if report.WeekFrom == nil || *report.WeekFrom != from || report.WeekTo == nil || *report.WeekTo != to {
		t.Errorf("weekly_report = %+v, want the completed week %s…%s", *report, from, to)
	}

	// Viewing an earlier period moves the watermark but does not clear the
	// advisory for a newer completed week.
	older := time.Now().AddDate(0, 0, -21).Format("2006-01-02")
	code, seen := postReportSeen(t, "owner@example.com", fmt.Sprintf(`{"week_to": %q}`, older))
	if code != http.StatusOK || seen.SeenThrough != older {
		t.Fatalf("marking an older period seen: code = %d, seen_through = %q", code, seen.SeenThrough)
	}
	_, response = getReminders(t, "owner@example.com")
	if findReminder(t, response, "weekly_report") == nil {
		t.Error("weekly_report advisory cleared by viewing a report that predates the completed week")
	}

	// Viewing the completed week itself clears it, on the server and in the
	// response watermark.
	code, seen = postReportSeen(t, "owner@example.com", fmt.Sprintf(`{"week_to": %q}`, to))
	if code != http.StatusOK || seen.SeenThrough != to {
		t.Fatalf("marking the completed week seen: code = %d, seen_through = %q", code, seen.SeenThrough)
	}
	_, response = getReminders(t, "owner@example.com")
	if findReminder(t, response, "weekly_report") != nil {
		t.Error("weekly_report advisory survived being viewed")
	}

	// The watermark is monotonic: re-reading an older report cannot bring the
	// advisory back.
	code, seen = postReportSeen(t, "owner@example.com", fmt.Sprintf(`{"week_to": %q}`, older))
	if code != http.StatusOK || seen.SeenThrough != to {
		t.Fatalf("re-seeing an older period: code = %d, seen_through = %q, want %q", code, seen.SeenThrough, to)
	}
	_, response = getReminders(t, "owner@example.com")
	if findReminder(t, response, "weekly_report") != nil {
		t.Error("weekly_report advisory returned after re-reading an older report")
	}
}

func TestWeeklyReportSeenRejectsBadInput(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2025-01-01", 2000)

	for name, body := range map[string]string{
		"not JSON":       `not json`,
		"missing date":   `{}`,
		"malformed date": `{"week_to": "07/10/2026"}`,
		"future date":    fmt.Sprintf(`{"week_to": %q}`, daysAgoISO(-1)),
	} {
		if code, _ := postReportSeen(t, "owner@example.com", body); code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", name, code)
		}
	}
}

func TestRemindersAreScopedToTheActingUser(t *testing.T) {
	setupHandlerDB(t)
	ownerID := createTestUser(t, "owner@example.com", "2025-01-01", 2000)
	createTestUser(t, "other@example.com", "2025-01-01", 1800)

	// The owner logs everything; the other account logs nothing.
	if _, err := database.DB.Exec(`INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, ?, ?)`, ownerID, reminderToday(), 90.0); err != nil {
		t.Fatalf("inserting owner weigh-in: %v", err)
	}
	if _, err := database.DB.Exec(`INSERT INTO measurement_entries (user_id, date, waist_cm) VALUES (?, ?, ?)`, ownerID, reminderToday(), 99.0); err != nil {
		t.Fatalf("inserting owner measurement: %v", err)
	}
	_, to := lastCompletedWeek(reminderToday())
	if code, _ := postReportSeen(t, "owner@example.com", fmt.Sprintf(`{"week_to": %q}`, to)); code != http.StatusOK {
		t.Fatalf("owner marking report seen: status = %d", code)
	}

	// The owner is all caught up…
	_, response := getReminders(t, "owner@example.com")
	if len(response.Items) != 0 {
		t.Errorf("owner items = %+v, want none", response.Items)
	}

	// …while the other account still sees all three of its own nags: the
	// watermark and the data never cross accounts (decision 121's "particular
	// user").
	_, response = getReminders(t, "other@example.com")
	if len(response.Items) != 3 {
		t.Fatalf("other account items = %+v, want all three", response.Items)
	}
	for _, want := range []string{"weigh_in", "body_measurements", "weekly_report"} {
		if findReminder(t, response, want) == nil {
			t.Errorf("other account is missing its %s reminder", want)
		}
	}
}

func TestRemindersRequireAUser(t *testing.T) {
	setupHandlerDB(t)

	recorder := httptest.NewRecorder()
	HandleGetReminders(recorder, authedRequest(t, http.MethodGet, "/api/reminders", "", "ghost@example.com"))
	if recorder.Code != http.StatusNotFound {
		t.Errorf("unknown user: status = %d, want 404", recorder.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/reminders", nil)
	recorder = httptest.NewRecorder()
	HandleGetReminders(recorder, req)
	if recorder.Code != http.StatusUnauthorized {
		t.Errorf("no identity: status = %d, want 401", recorder.Code)
	}

	// The seen endpoint refuses the same cases rather than silently writing a
	// watermark for nobody.
	recorder = httptest.NewRecorder()
	HandleWeeklyReportSeen(recorder, authedRequest(t, http.MethodPost, "/api/reminders/weekly-report-seen", `{"week_to":"2026-10-04"}`, "ghost@example.com"))
	if recorder.Code != http.StatusNotFound {
		t.Errorf("seen for unknown user: status = %d, want 404", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "User not found") {
		t.Errorf("body = %q, want the not-found message", recorder.Body.String())
	}
}
