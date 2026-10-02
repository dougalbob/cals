package handlers

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"

	"cals/internal/auth"
	"cals/internal/database"
)

type Drink struct {
	ID       int64  `json:"id"`
	UserID   int64  `json:"user_id"`
	Name     string `json:"name"`
	Icon     string `json:"icon"`
	VolumeML int    `json:"volume_ml"`
	Calories int    `json:"calories"`
	// CountsTowardWater marks the drinks that contribute to the daily water
	// target. Water is logged as a drink — there is no second ledger.
	CountsTowardWater bool `json:"counts_toward_water"`
}

type DrinkEntry struct {
	ID      int64  `json:"id"`
	DrinkID int64  `json:"drink_id"`
	Date    string `json:"date"`
	Name    string `json:"name"`
	Icon    string `json:"icon"`
	// VolumeML and Calories are snapshots taken when the entry was logged, so
	// editing a drink definition later does not rewrite history.
	VolumeML int `json:"volume_ml"`
	Calories int `json:"calories"`
}

// drinkUserID resolves the current user, creating the account on first request
// exactly as the diary and user handlers do. This matters on a brand-new
// database: the Diary may load the drink list before anything else has created
// the user, and it should show an empty list rather than "User not found".
func drinkUserID(r *http.Request) (int64, error) {
	user, err := GetOrCreateUser(auth.GetUserEmail(r.Context()))
	if err != nil {
		return 0, err
	}
	return user.ID, nil
}

// HandleGetDrinks returns user's drink templates
func HandleGetDrinks(w http.ResponseWriter, r *http.Request) {
	userID, err := drinkUserID(r)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, user_id, name, icon, volume_ml, calories, counts_toward_water
		FROM drinks WHERE user_id = ?
		ORDER BY name ASC
	`, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var drinks []Drink
	for rows.Next() {
		var d Drink
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.Icon, &d.VolumeML, &d.Calories, &d.CountsTowardWater); err != nil {
			continue
		}
		drinks = append(drinks, d)
	}

	// No drinks are created automatically: the user's own drink definitions are
	// the only source (product decision 8 — no invented drinks). An empty list
	// is a valid answer and the Diary prompts the user to add one.
	if drinks == nil {
		drinks = []Drink{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(drinks)
}

// HandleCreateDrink creates a new drink template
func HandleCreateDrink(w http.ResponseWriter, r *http.Request) {
	userID, err := drinkUserID(r)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	var drink Drink
	if err := json.NewDecoder(r.Body).Decode(&drink); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(drink.Name) == "" {
		http.Error(w, "Drink name is required", http.StatusBadRequest)
		return
	}
	if drink.VolumeML <= 0 {
		http.Error(w, "Drink volume_ml must be greater than zero", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`
		INSERT INTO drinks (user_id, name, icon, volume_ml, calories, counts_toward_water)
		VALUES (?, ?, ?, ?, ?, ?)
	`, userID, drink.Name, drink.Icon, drink.VolumeML, drink.Calories, drink.CountsTowardWater)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	drink.ID, _ = result.LastInsertId()
	drink.UserID = userID

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(drink)
}

// HandleUpdateDrink updates a drink template
func HandleUpdateDrink(w http.ResponseWriter, r *http.Request) {
	userID, err := drinkUserID(r)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var drink Drink
	if err := json.NewDecoder(r.Body).Decode(&drink); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(drink.Name) == "" {
		http.Error(w, "Drink name is required", http.StatusBadRequest)
		return
	}
	if drink.VolumeML <= 0 {
		http.Error(w, "Drink volume_ml must be greater than zero", http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`
		UPDATE drinks SET name = ?, icon = ?, volume_ml = ?, calories = ?, counts_toward_water = ?
		WHERE id = ? AND user_id = ?
	`, drink.Name, drink.Icon, drink.VolumeML, drink.Calories, drink.CountsTowardWater, id, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	drink.ID = id
	drink.UserID = userID

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(drink)
}

// HandleDeleteDrink deletes a drink template
func HandleDeleteDrink(w http.ResponseWriter, r *http.Request) {
	userID, err := drinkUserID(r)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Delete entries first
	database.DB.Exec(`DELETE FROM drink_entries WHERE drink_id = ? AND user_id = ?`, id, userID)
	
	_, err = database.DB.Exec(`DELETE FROM drinks WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleGetDrinkEntries returns drink entries for a date
func HandleGetDrinkEntries(w http.ResponseWriter, r *http.Request) {
	userID, err := drinkUserID(r)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
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
		WHERE de.user_id = ? AND de.date = ?
		ORDER BY de.created_at ASC, de.id ASC
	`, userID, date)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var entries []DrinkEntry
	for rows.Next() {
		var e DrinkEntry
		if err := rows.Scan(&e.ID, &e.DrinkID, &e.Date, &e.Name, &e.Icon, &e.VolumeML, &e.Calories); err != nil {
			continue
		}
		entries = append(entries, e)
	}

	if entries == nil {
		entries = []DrinkEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

// HandleAddDrinkEntry adds a drink entry for a date
func HandleAddDrinkEntry(w http.ResponseWriter, r *http.Request) {
	userID, err := drinkUserID(r)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	var entry struct {
		DrinkID int64  `json:"drink_id"`
		Date    string `json:"date"`
		// VolumeML optionally overrides the drink's typical volume (for
		// example a 500 ml bottle instead of a 250 ml glass). Calories are
		// scaled from the drink's per-millilitre value.
		VolumeML int `json:"volume_ml"`
	}
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if entry.Date == "" {
		http.Error(w, "date is required", http.StatusBadRequest)
		return
	}

	// Only the owner's drink can be logged; this also means a drink id from
	// another user is not silently accepted.
	var drinkVolume, drinkCalories int
	err = database.DB.QueryRow(`
		SELECT volume_ml, calories FROM drinks WHERE id = ? AND user_id = ?
	`, entry.DrinkID, userID).Scan(&drinkVolume, &drinkCalories)
	if err == sql.ErrNoRows {
		http.Error(w, "Drink not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	volumeML := entry.VolumeML
	if volumeML <= 0 {
		volumeML = drinkVolume
	}
	if volumeML <= 0 {
		http.Error(w, "volume_ml must be greater than zero", http.StatusBadRequest)
		return
	}

	// Snapshot the calories for the volume actually logged.
	calories := drinkCalories
	if volumeML != drinkVolume && drinkVolume > 0 {
		calories = int(math.Round(float64(drinkCalories) * float64(volumeML) / float64(drinkVolume)))
	}

	result, err := database.DB.Exec(`
		INSERT INTO drink_entries (user_id, drink_id, date, volume_ml, calories)
		VALUES (?, ?, ?, ?, ?)
	`, userID, entry.DrinkID, entry.Date, volumeML, calories)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	// Return the full entry
	var de DrinkEntry
	database.DB.QueryRow(`
		SELECT de.id, de.drink_id, de.date, d.name, d.icon, de.volume_ml, de.calories
		FROM drink_entries de
		JOIN drinks d ON de.drink_id = d.id
		WHERE de.id = ?
	`, id).Scan(&de.ID, &de.DrinkID, &de.Date, &de.Name, &de.Icon, &de.VolumeML, &de.Calories)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(de)
}

// HandleDeleteDrinkEntry removes a drink entry
func HandleDeleteDrinkEntry(w http.ResponseWriter, r *http.Request) {
	userID, err := drinkUserID(r)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`DELETE FROM drink_entries WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
