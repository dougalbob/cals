package handlers

import (
	"encoding/json"
	"net/http"

	"cals/internal/auth"
	"cals/internal/database"
)

// WaterResponse is the daily water summary. Water has exactly one source of
// truth: drink entries whose drink has counts_toward_water = 1. The target is
// the user's own daily_water_goal_ml.
type WaterResponse struct {
	Date       string       `json:"date"`
	ConsumedML int          `json:"consumed_ml"`
	TargetML   int          `json:"target_ml"`
	Entries    []DrinkEntry `json:"entries"`
}

// HandleGetWater returns how much water the user has logged on a date, from the
// water-counting drink entries, plus their target.
func HandleGetWater(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	date := r.URL.Query().Get("date")
	if date == "" {
		http.Error(w, "Date required", http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query(`
		SELECT de.id, de.drink_id, de.date, d.name, d.icon, de.volume_ml, de.calories
		FROM drink_entries de
		JOIN drinks d ON de.drink_id = d.id
		WHERE de.user_id = ? AND de.date = ? AND d.counts_toward_water = 1
		ORDER BY de.created_at ASC, de.id ASC
	`, user.ID, date)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	response := WaterResponse{
		Date:     date,
		TargetML: user.DailyWaterGoalML,
		Entries:  []DrinkEntry{},
	}
	for rows.Next() {
		var entry DrinkEntry
		if err := rows.Scan(&entry.ID, &entry.DrinkID, &entry.Date, &entry.Name, &entry.Icon, &entry.VolumeML, &entry.Calories); err != nil {
			continue
		}
		response.ConsumedML += entry.VolumeML
		response.Entries = append(response.Entries, entry)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
