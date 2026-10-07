package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
	"cals/internal/models"
)

// measurementParts is the fixed vocabulary of body-measurement columns, in the
// JSON key form the API accepts and returns. The order is presentation order
// (top of the body down) and is shared by the list, upsert and update paths.
var measurementParts = []string{
	"neck_cm",
	"chest_cm",
	"bust_cm",
	"waist_cm",
	"upper_arm_cm",
	"hips_cm",
	"thigh_cm",
}

// measurementColumns maps each JSON key to its SQLite column. They happen to
// be identical today; the map keeps the SQL honest if that ever drifts.
var measurementColumns = map[string]string{
	"neck_cm":      "neck_cm",
	"chest_cm":     "chest_cm",
	"bust_cm":      "bust_cm",
	"waist_cm":     "waist_cm",
	"upper_arm_cm": "upper_arm_cm",
	"hips_cm":      "hips_cm",
	"thigh_cm":     "thigh_cm",
}

// HandleGetMeasurements returns the user's measurement history.
//
// Three contracts live behind one route. With no parameters it keeps exactly
// V1's behaviour — the newest 20 rows, newest first. With a window (an explicit
// from/to pair, or a legacy days count) it returns every row inside that window,
// using the same 400-day span bound and strict 400s as the other series
// endpoints (slice 14.1). The additive all=true option returns all sessions for
// the React history list without changing either existing contract.
//
// Values are plain numbers or null. They used to be raw sql.NullFloat64
// objects ({"Float64": 98.2, "Valid": true}) — verified against a real server
// — which the React types never matched, so the rc28 Metrics screen crashed on
// any account with measurements. Slice 14.4 normalises the wire shape here and
// updates the one legacy reader in web/static at the same time, the same way
// slice 14.1 handled the RFC3339 date fix.
func HandleGetMeasurements(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	query := r.URL.Query()
	windowed := query.Get("from") != "" || query.Get("to") != "" || query.Get("days") != ""

	// The React Metrics history list can opt into all-time rows without
	// changing the old no-parameter V1 contract (newest 20) or the bounded
	// from/to window contract. Avoid silently ignoring a conflicting range.
	if query.Get("all") == "true" {
		if windowed {
			http.Error(w, "all=true cannot be combined with a measurement range", http.StatusBadRequest)
			return
		}
		rows, err := database.DB.Query(`
			SELECT id, user_id, date(date) AS day, bust_cm, chest_cm, waist_cm, hips_cm, upper_arm_cm, thigh_cm, neck_cm, created_at
			FROM measurement_entries
			WHERE user_id = ?
			ORDER BY day DESC, id DESC
		`, userID)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		writeMeasurementRows(w, rows)
		return
	}

	// date(date) rather than the bare column: measurement_entries.date is
	// declared DATE, so the driver returns RFC3339 when it is scanned into a
	// string (fixed in slice 14.1, kept here).
	if !windowed {
		rows, err := database.DB.Query(`
			SELECT id, user_id, date(date) AS day, bust_cm, chest_cm, waist_cm, hips_cm, upper_arm_cm, thigh_cm, neck_cm, created_at
			FROM measurement_entries
			WHERE user_id = ?
			ORDER BY day DESC, id DESC
			LIMIT 20
		`, userID)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		writeMeasurementRows(w, rows)
		return
	}

	from, to, ok := resolveSeriesRange(w, r, 20, maxSeriesSpan, true)
	if !ok {
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, user_id, date(date) AS day, bust_cm, chest_cm, waist_cm, hips_cm, upper_arm_cm, thigh_cm, neck_cm, created_at
		FROM measurement_entries
		WHERE user_id = ? AND date >= date(?) AND date <= date(?)
		ORDER BY day DESC, id DESC
	`, userID, from, to)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeMeasurementRows(w, rows)
}

func writeMeasurementRows(w http.ResponseWriter, rows interface {
	Next() bool
	Scan(dest ...any) error
}) {
	var entries []models.MeasurementEntry
	for rows.Next() {
		var e models.MeasurementEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.Date, &e.BustCM, &e.ChestCM, &e.WaistCM, &e.HipsCM, &e.UpperArmCM, &e.ThighCM, &e.NeckCM, &e.CreatedAt); err != nil {
			continue
		}
		e.Date = isoDate(e.Date)
		entries = append(entries, e)
	}

	if entries == nil {
		entries = []models.MeasurementEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

// HandleCreateMeasurement records a measurement session for a date.
//
// Semantics since slice 14.4 (decision 96): the body's non-null parts are
// **merged** into the row for that date, creating it when it does not exist.
// Before this slice the handler deleted the day's row and re-inserted it, so
// posting one body part silently wiped every other part recorded the same day
// — verified live. The body map's per-part save stands on the merge rule:
// committing a waist can never erase the hips logged earlier the same day.
//
// Null, zero and negative values mean "not measured this time" and never
// overwrite anything; an empty body is a 400 rather than an all-null row.
func HandleCreateMeasurement(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	var input struct {
		Date       string   `json:"date"`
		BustCM     *float64 `json:"bust_cm"`
		ChestCM    *float64 `json:"chest_cm"`
		WaistCM    *float64 `json:"waist_cm"`
		HipsCM     *float64 `json:"hips_cm"`
		UpperArmCM *float64 `json:"upper_arm_cm"`
		ThighCM    *float64 `json:"thigh_cm"`
		NeckCM     *float64 `json:"neck_cm"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if input.Date == "" {
		http.Error(w, "Date is required", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", input.Date); err != nil {
		http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	provided := map[string]*float64{
		"bust_cm":      input.BustCM,
		"chest_cm":     input.ChestCM,
		"waist_cm":     input.WaistCM,
		"hips_cm":      input.HipsCM,
		"upper_arm_cm": input.UpperArmCM,
		"thigh_cm":     input.ThighCM,
		"neck_cm":      input.NeckCM,
	}

	sets := map[string]float64{}
	for _, part := range measurementParts {
		value := provided[part]
		if value == nil || *value <= 0 {
			continue
		}
		sets[measurementColumns[part]] = *value
	}
	if len(sets) == 0 {
		http.Error(w, "At least one measurement is required", http.StatusBadRequest)
		return
	}

	// One row per (user, date): the old delete-then-insert guaranteed that, and
	// the merge keeps it.
	var existingID int64
	err = database.DB.QueryRow(`
		SELECT id FROM measurement_entries WHERE user_id = ? AND date = date(?)
	`, userID, input.Date).Scan(&existingID)

	if err == nil {
		assignments := make([]string, 0, len(sets))
		args := make([]any, 0, len(sets)+1)
		for _, part := range measurementParts {
			column := measurementColumns[part]
			if value, ok := sets[column]; ok {
				assignments = append(assignments, column+" = ?")
				args = append(args, value)
			}
		}
		args = append(args, existingID)
		if _, err := database.DB.Exec(`
			UPDATE measurement_entries SET `+strings.Join(assignments, ", ")+` WHERE id = ?
		`, args...); err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int64{"id": existingID})
		return
	}

	columns := []string{"user_id", "date"}
	placeholders := []string{"?", "?"}
	args := []any{userID, input.Date}
	for _, part := range measurementParts {
		column := measurementColumns[part]
		if value, ok := sets[column]; ok {
			columns = append(columns, column)
			placeholders = append(placeholders, "?")
			args = append(args, value)
		}
	}

	result, err := database.DB.Exec(`
		INSERT INTO measurement_entries (`+strings.Join(columns, ", ")+`)
		VALUES (`+strings.Join(placeholders, ", ")+`)
	`, args...)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]int64{"id": id})
}

// HandleUpdateMeasurement patches one existing entry (decision 96): correcting
// last month's waist must not invent a new measurement and must not touch the
// other parts of the row.
//
// The body is read as a raw map so that three states stay distinct: an absent
// key leaves the part alone, an explicit null clears it, and a positive number
// sets it. Zero and negative values are rejected — null is the deliberate way
// to clear. The optional date moves the whole entry and must be YYYY-MM-DD.
func HandleUpdateMeasurement(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var entryID int64
	err = database.DB.QueryRow(`SELECT id FROM measurement_entries WHERE id = ? AND user_id = ?`, id, userID).Scan(&entryID)
	if err != nil {
		http.Error(w, "Entry not found", http.StatusNotFound)
		return
	}

	var updates map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	for key := range updates {
		if key == "date" {
			continue
		}
		if _, ok := measurementColumns[key]; !ok {
			http.Error(w, "Unknown field: "+key, http.StatusBadRequest)
			return
		}
	}

	// Built in the fixed part order (then date) so the SQL is deterministic
	// even though the body arrived as a JSON object.
	assignments := []string{}
	args := []any{}

	for _, part := range measurementParts {
		raw, present := updates[part]
		if !present {
			continue
		}
		column := measurementColumns[part]

		if strings.TrimSpace(string(raw)) == "null" {
			assignments = append(assignments, column+" = NULL")
			continue
		}

		var value float64
		if err := json.Unmarshal(raw, &value); err != nil {
			http.Error(w, part+" must be a number or null", http.StatusBadRequest)
			return
		}
		if value <= 0 {
			http.Error(w, part+" must be greater than zero (send null to clear it)", http.StatusBadRequest)
			return
		}
		assignments = append(assignments, column+" = ?")
		args = append(args, value)
	}

	if raw, present := updates["date"]; present {
		var date string
		if err := json.Unmarshal(raw, &date); err != nil || date == "" {
			http.Error(w, "date must be a YYYY-MM-DD string", http.StatusBadRequest)
			return
		}
		if _, err := time.Parse("2006-01-02", date); err != nil {
			http.Error(w, "date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		assignments = append(assignments, "date = ?")
		args = append(args, date)
	}

	if len(assignments) == 0 {
		http.Error(w, "No fields to update", http.StatusBadRequest)
		return
	}

	args = append(args, entryID)
	if _, err := database.DB.Exec(`
		UPDATE measurement_entries SET `+strings.Join(assignments, ", ")+` WHERE id = ?
	`, args...); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeMeasurementEntry(w, entryID)
}

// writeMeasurementEntry re-reads and returns one entry as the API shapes it.
func writeMeasurementEntry(w http.ResponseWriter, id int64) {
	var e models.MeasurementEntry
	err := database.DB.QueryRow(`
		SELECT id, user_id, date(date) AS day, bust_cm, chest_cm, waist_cm, hips_cm, upper_arm_cm, thigh_cm, neck_cm, created_at
		FROM measurement_entries WHERE id = ?
	`, id).Scan(&e.ID, &e.UserID, &e.Date, &e.BustCM, &e.ChestCM, &e.WaistCM, &e.HipsCM, &e.UpperArmCM, &e.ThighCM, &e.NeckCM, &e.CreatedAt)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	e.Date = isoDate(e.Date)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(e)
}

// MeasurementPoint is one body part's newest recorded value, with the value
// before it so a UI can say "98.2 cm, previously 99.4 cm" without a second
// round trip.
type MeasurementPoint struct {
	Value    float64           `json:"value"`
	Date     string            `json:"date"`
	Previous *MeasurementPoint `json:"previous"`
}

// MeasurementLatest carries the newest non-null value for every part. A part
// that has never been measured is null.
type MeasurementLatest struct {
	NeckCM     *MeasurementPoint `json:"neck_cm"`
	ChestCM    *MeasurementPoint `json:"chest_cm"`
	BustCM     *MeasurementPoint `json:"bust_cm"`
	WaistCM    *MeasurementPoint `json:"waist_cm"`
	UpperArmCM *MeasurementPoint `json:"upper_arm_cm"`
	HipsCM     *MeasurementPoint `json:"hips_cm"`
	ThighCM    *MeasurementPoint `json:"thigh_cm"`
}

// HandleGetLatestMeasurements answers "what did I last record for each part,
// and when" — the body map's pop-up. It is a dedicated lookup because the
// list endpoint's 20-row window can hide a part's last value entirely once the
// history grows, and "the newest row" is not the same as "the newest non-null
// value per part".
func HandleGetLatestMeasurements(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	latest := MeasurementLatest{}
	for _, part := range measurementParts {
		column := measurementColumns[part]
		rows, err := database.DB.Query(`
			SELECT date(date) AS day, `+column+`
			FROM measurement_entries
			WHERE user_id = ? AND `+column+` IS NOT NULL
			ORDER BY day DESC, id DESC
			LIMIT 2
		`, userID)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}

		var newest, previous *MeasurementPoint
		for rows.Next() {
			var date string
			var value float64
			if err := rows.Scan(&date, &value); err != nil {
				continue
			}
			point := &MeasurementPoint{Value: value, Date: isoDate(date)}
			if newest == nil {
				newest = point
			} else {
				previous = point
			}
		}
		rows.Close()

		if newest != nil {
			newest.Previous = previous
		}

		switch part {
		case "neck_cm":
			latest.NeckCM = newest
		case "chest_cm":
			latest.ChestCM = newest
		case "bust_cm":
			latest.BustCM = newest
		case "waist_cm":
			latest.WaistCM = newest
		case "upper_arm_cm":
			latest.UpperArmCM = newest
		case "hips_cm":
			latest.HipsCM = newest
		case "thigh_cm":
			latest.ThighCM = newest
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(latest)
}

func HandleDeleteMeasurement(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`DELETE FROM measurement_entries WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		http.Error(w, "Entry not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
