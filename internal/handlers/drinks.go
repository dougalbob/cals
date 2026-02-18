package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

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
}

type DrinkEntry struct {
	ID       int64  `json:"id"`
	DrinkID  int64  `json:"drink_id"`
	Date     string `json:"date"`
	Name     string `json:"name"`
	Icon     string `json:"icon"`
	VolumeML int    `json:"volume_ml"`
	Calories int    `json:"calories"`
}

// HandleGetDrinks returns user's drink templates
func HandleGetDrinks(w http.ResponseWriter, r *http.Request) {
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

	rows, err := database.DB.Query(`
		SELECT id, user_id, name, icon, volume_ml, calories
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
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.Icon, &d.VolumeML, &d.Calories); err != nil {
			continue
		}
		drinks = append(drinks, d)
	}

	// If no drinks, create defaults
	if len(drinks) == 0 {
		defaults := []Drink{
			{Name: "Coffee", Icon: "☕", VolumeML: 300, Calories: 20},
			{Name: "Water", Icon: "💧", VolumeML: 250, Calories: 0},
			{Name: "Beer", Icon: "🍺", VolumeML: 375, Calories: 155},
			{Name: "Milk", Icon: "🥛", VolumeML: 200, Calories: 100},
		}
		for _, d := range defaults {
			result, err := database.DB.Exec(`
				INSERT INTO drinks (user_id, name, icon, volume_ml, calories)
				VALUES (?, ?, ?, ?, ?)
			`, userID, d.Name, d.Icon, d.VolumeML, d.Calories)
			if err == nil {
				d.ID, _ = result.LastInsertId()
				d.UserID = userID
				drinks = append(drinks, d)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(drinks)
}

// HandleCreateDrink creates a new drink template
func HandleCreateDrink(w http.ResponseWriter, r *http.Request) {
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

	var drink Drink
	if err := json.NewDecoder(r.Body).Decode(&drink); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`
		INSERT INTO drinks (user_id, name, icon, volume_ml, calories)
		VALUES (?, ?, ?, ?, ?)
	`, userID, drink.Name, drink.Icon, drink.VolumeML, drink.Calories)
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

	var drink Drink
	if err := json.NewDecoder(r.Body).Decode(&drink); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`
		UPDATE drinks SET name = ?, icon = ?, volume_ml = ?, calories = ?
		WHERE id = ? AND user_id = ?
	`, drink.Name, drink.Icon, drink.VolumeML, drink.Calories, id, userID)
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

	date := r.URL.Query().Get("date")
	if date == "" {
		http.Error(w, "Date required", http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query(`
		SELECT de.id, de.drink_id, de.date, d.name, d.icon, d.volume_ml, d.calories
		FROM drink_entries de
		JOIN drinks d ON de.drink_id = d.id
		WHERE de.user_id = ? AND de.date = ?
		ORDER BY de.created_at ASC
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

	var entry struct {
		DrinkID int64  `json:"drink_id"`
		Date    string `json:"date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`
		INSERT INTO drink_entries (user_id, drink_id, date)
		VALUES (?, ?, ?)
	`, userID, entry.DrinkID, entry.Date)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	// Return the full entry
	var de DrinkEntry
	database.DB.QueryRow(`
		SELECT de.id, de.drink_id, de.date, d.name, d.icon, d.volume_ml, d.calories
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

	_, err = database.DB.Exec(`DELETE FROM drink_entries WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
