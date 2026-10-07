package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
	"cals/internal/models"
)

// The reminders bell (decisions 121–122) — the first slice of the future
// Issues bell (decision 42).
//
// GET /api/reminders lists only what is currently asking for the acting user's
// attention:
//
//   - weigh_in: due once 3 or more days have passed since the newest weigh-in
//     (decision 122), or immediately for someone who has never weighed in;
//   - body_measurements: the same shape at a 14-day cadence (decision 122,
//     revising decision 87's 3–4 week ideal);
//   - weekly_report: the most recent completed Monday–Sunday period, present
//     only while the user has not viewed a report through its end date.
//
// The cadence items are derived purely from live data, so logging the weigh-in
// or measurement session is what clears them — no dismissals, no snoozing
// (owner direction 2026-10-07). The weekly-report advisory instead resolves
// against the per-user `users.report_seen_through` watermark, written by
// POST /api/reminders/weekly-report-seen when a completed report is actually
// displayed, so it clears on every device the household uses.

// Cadence windows, in days (decision 122). A cadence item is due when the gap
// since the last recorded date has reached its window, so consecutive weigh-ins
// stay at most 3 days apart and measurement sessions at most 14.
const (
	weighInReminderCadenceDays     = 3
	measurementReminderCadenceDays = 14
)

// HandleGetReminders returns the acting user's active reminder items.
func HandleGetReminders(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := reminderUser(w, r)
	if !ok {
		return
	}

	today := time.Now().Format("2006-01-02")
	items := []models.ReminderItem{}

	if item, due := cadenceReminder("weigh_in", weighInReminderCadenceDays, lastEntryDate(userID, "weight_entries"), today); due {
		items = append(items, item)
	}
	if item, due := cadenceReminder("body_measurements", measurementReminderCadenceDays, lastEntryDate(userID, "measurement_entries"), today); due {
		items = append(items, item)
	}
	if item, due := weeklyReportReminder(userID, today); due {
		items = append(items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.RemindersResponse{Items: items})
}

// HandleWeeklyReportSeen records that the acting user has viewed a completed
// weekly report through the given date. The watermark only ever moves forward:
// re-reading an older report cannot un-see a newer one.
//
// Body: {"week_to": "YYYY-MM-DD"} — the last day of the viewed period. Future
// dates are refused; a period that has not finished cannot have been reviewed.
func HandleWeeklyReportSeen(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := reminderUser(w, r)
	if !ok {
		return
	}

	var body struct {
		WeekTo string `json:"week_to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	weekTo, err := time.Parse("2006-01-02", body.WeekTo)
	if err != nil {
		http.Error(w, "week_to must be a YYYY-MM-DD date", http.StatusBadRequest)
		return
	}
	today := time.Now().Format("2006-01-02")
	if body.WeekTo > today {
		http.Error(w, "Cannot mark a report seen before its period has finished", http.StatusBadRequest)
		return
	}

	seenThrough, err := readReportSeenThrough(userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	// ISO dates compare correctly as text; only move the watermark forward.
	// The seen date is written back through time.Parse's canonical form so a
	// hand-posted "2026-10-4" cannot leak into the comparison space.
	candidate := weekTo.Format("2006-01-02")
	if seenThrough == "" || candidate > seenThrough {
		if _, err := database.DB.Exec(`UPDATE users SET report_seen_through = ? WHERE id = ?`, candidate, userID); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		seenThrough = candidate
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.WeeklyReportSeenResponse{SeenThrough: seenThrough})
}

// reminderUser resolves the acting user for the request (the same identity
// every data handler reads) and reports whether the response has been written.
func reminderUser(w http.ResponseWriter, r *http.Request) (int64, string, bool) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return 0, "", false
	}
	var userID int64
	if err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID); err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return 0, "", false
	}
	return userID, email, true
}

// lastEntryDate is the newest recorded date on a per-user dated table, or ""
// when there is nothing. The date() call defeats the RFC3339 scan that
// mattn/go-sqlite3 performs on DATE columns (see isoDate in calendar.go).
func lastEntryDate(userID int64, table string) string {
	// table is never user input: two fixed call sites above.
	var last sql.NullString
	if err := database.DB.QueryRow(`SELECT MAX(date(date)) FROM `+table+` WHERE user_id = ?`, userID).Scan(&last); err != nil {
		return ""
	}
	if !last.Valid {
		return ""
	}
	return isoDate(last.String)
}

// cadenceReminder builds one cadence item and reports whether it is due.
// A gap that has reached the window is due; nothing recorded at all is due at
// once, with the absence made explicit rather than counted as day zero.
func cadenceReminder(itemType string, cadenceDays int, lastDate, today string) (models.ReminderItem, bool) {
	item := models.ReminderItem{
		Type:        itemType,
		CadenceDays: cadenceDays,
	}
	if lastDate == "" {
		return item, true
	}
	days := daysBetweenDates(lastDate, today)
	if days < 0 {
		// A future-dated entry is an error or a correction in flight; not due.
		return item, false
	}
	if days < cadenceDays {
		return item, false
	}
	item.LastDate = &lastDate
	item.DaysSince = &days
	return item, true
}

// weeklyReportReminder names the most recent completed Monday–Sunday period
// when the user has not yet viewed a report through its end date.
func weeklyReportReminder(userID int64, today string) (models.ReminderItem, bool) {
	from, to := lastCompletedWeek(today)
	seenThrough, err := readReportSeenThrough(userID)
	if err != nil {
		// A read failure should not fabricate a nag; say nothing this request.
		return models.ReminderItem{}, false
	}
	if seenThrough != "" && seenThrough >= to {
		return models.ReminderItem{}, false
	}
	item := models.ReminderItem{
		Type:     "weekly_report",
		WeekFrom: &from,
		WeekTo:   &to,
	}
	return item, true
}

// readReportSeenThrough returns the user's report watermark as a bare
// YYYY-MM-DD string, or "" when no report has ever been viewed.
func readReportSeenThrough(userID int64) (string, error) {
	var seen sql.NullString
	if err := database.DB.QueryRow(`SELECT report_seen_through FROM users WHERE id = ?`, userID).Scan(&seen); err != nil {
		return "", err
	}
	if !seen.Valid {
		return "", nil
	}
	return isoDate(seen.String), nil
}

// lastCompletedWeek returns the Monday and Sunday of the most recent week that
// has fully finished — the previous Mon–Sun week, whatever today is. A report
// is "complete" once its week has ended (decision 121).
func lastCompletedWeek(today string) (from string, to string) {
	t, err := time.Parse("2006-01-02", today)
	if err != nil {
		return "", ""
	}
	dow := (int(t.Weekday()) + 6) % 7 // Mon=0 … Sun=6
	thisMonday := t.AddDate(0, 0, -dow)
	lastMonday := thisMonday.AddDate(0, 0, -7)
	return lastMonday.Format("2006-01-02"), lastMonday.AddDate(0, 0, 6).Format("2006-01-02")
}

// daysBetweenDates counts whole days from one YYYY-MM-DD date to another.
func daysBetweenDates(from, to string) int {
	a, errA := time.Parse("2006-01-02", strings.TrimSpace(from))
	b, errB := time.Parse("2006-01-02", strings.TrimSpace(to))
	if errA != nil || errB != nil {
		return 0
	}
	return int(b.Sub(a).Hours() / 24)
}
