package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"cals/internal/auth"
	"cals/internal/database"
	"cals/internal/models"
)

func HandleGetWeightEntries(w http.ResponseWriter, r *http.Request) {
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

	// Get optional days parameter
	days := 90 // default
	if d := r.URL.Query().Get("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 {
			days = parsed
		}
	}

	rows, err := database.DB.Query(`
		SELECT id, user_id, date, weight_kg, created_at 
		FROM weight_entries 
		WHERE user_id = ? AND date >= date('now', '-' || ? || ' days')
		ORDER BY date DESC
	`, userID, days)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var entries []models.WeightEntry
	for rows.Next() {
		var e models.WeightEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.Date, &e.WeightKG, &e.CreatedAt); err != nil {
			continue
		}
		entries = append(entries, e)
	}

	if entries == nil {
		entries = []models.WeightEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

func HandleCreateWeightEntry(w http.ResponseWriter, r *http.Request) {
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

	var entry models.WeightEntry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if entry.WeightKG <= 0 {
		http.Error(w, "Weight must be positive", http.StatusBadRequest)
		return
	}

	if entry.Date == "" {
		http.Error(w, "Date is required", http.StatusBadRequest)
		return
	}

	// Upsert - replace if same date exists
	result, err := database.DB.Exec(`
		INSERT INTO weight_entries (user_id, date, weight_kg)
		VALUES (?, ?, ?)
		ON CONFLICT(user_id, date) DO UPDATE SET weight_kg = excluded.weight_kg
	`, userID, entry.Date, entry.WeightKG)
	
	// If ON CONFLICT doesn't work (no unique constraint), try delete + insert
	if err != nil {
		// Delete existing entry for this date
		database.DB.Exec(`DELETE FROM weight_entries WHERE user_id = ? AND date = ?`, userID, entry.Date)
		
		result, err = database.DB.Exec(`
			INSERT INTO weight_entries (user_id, date, weight_kg)
			VALUES (?, ?, ?)
		`, userID, entry.Date, entry.WeightKG)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	id, _ := result.LastInsertId()
	entry.ID = id
	entry.UserID = userID

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(entry)
}

func HandleDeleteWeightEntry(w http.ResponseWriter, r *http.Request) {
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

	result, err := database.DB.Exec(`DELETE FROM weight_entries WHERE id = ? AND user_id = ?`, id, userID)
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
