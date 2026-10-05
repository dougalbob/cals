package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"cals/internal/auth"
	"cals/internal/database"
	"cals/internal/models"
)

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

	// date(date) rather than the bare column: measurement_entries.date is
	// declared DATE, so the driver returns RFC3339 when it is scanned into a
	// string, and the JSON has been carrying '2026-09-07T00:00:00Z' rather than
	// '2026-09-07'. The 20-row limit and the missing per-part update path are
	// the body-map slice's problem, not this one's.
	rows, err := database.DB.Query(`
		SELECT id, user_id, date(date) AS day, bust_cm, chest_cm, waist_cm, hips_cm, upper_arm_cm, thigh_cm, neck_cm, created_at
		FROM measurement_entries
		WHERE user_id = ?
		ORDER BY day DESC
		LIMIT 20
	`, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

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
		Date     string   `json:"date"`
		BustCM   *float64 `json:"bust_cm"`
		ChestCM  *float64 `json:"chest_cm"`
		WaistCM  *float64 `json:"waist_cm"`
		HipsCM   *float64 `json:"hips_cm"`
		UpperArmCM *float64 `json:"upper_arm_cm"`
		ThighCM  *float64 `json:"thigh_cm"`
		NeckCM   *float64 `json:"neck_cm"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if input.Date == "" {
		http.Error(w, "Date is required", http.StatusBadRequest)
		return
	}

	// Convert pointers to sql.NullFloat64
	toNull := func(v *float64) sql.NullFloat64 {
		if v == nil || *v == 0 {
			return sql.NullFloat64{}
		}
		return sql.NullFloat64{Float64: *v, Valid: true}
	}

	// Delete existing entry for this date first
	database.DB.Exec(`DELETE FROM measurement_entries WHERE user_id = ? AND date = ?`, userID, input.Date)

	result, err := database.DB.Exec(`
		INSERT INTO measurement_entries (user_id, date, bust_cm, chest_cm, waist_cm, hips_cm, upper_arm_cm, thigh_cm, neck_cm)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, userID, input.Date, 
		toNull(input.BustCM), toNull(input.ChestCM), toNull(input.WaistCM), 
		toNull(input.HipsCM), toNull(input.UpperArmCM), toNull(input.ThighCM), toNull(input.NeckCM))

	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]int64{"id": id})
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
