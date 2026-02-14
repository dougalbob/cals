package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
)

// DiaryEntry represents a food diary entry
type DiaryEntry struct {
	ID            int64   `json:"id"`
	UserID        int64   `json:"user_id"`
	Date          string  `json:"date"`
	Meal          string  `json:"meal"`
	FoodID        *int64  `json:"food_id,omitempty"`
	RecipeID      *int64  `json:"recipe_id,omitempty"`
	QuantityGrams float64 `json:"quantity_grams"`
	Calories      float64 `json:"calories"`
	Protein       float64 `json:"protein"`
	Carbs         float64 `json:"carbs"`
	Fat           float64 `json:"fat"`
	Fibre         float64 `json:"fibre"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
	// Joined data
	FoodName   string `json:"food_name,omitempty"`
	RecipeName string `json:"recipe_name,omitempty"`
}

// DiaryResponse includes entries and daily totals
type DiaryResponse struct {
	Date    string       `json:"date"`
	Entries []DiaryEntry `json:"entries"`
	Totals  DailyTotals  `json:"totals"`
}

// DailyTotals summarises a day's nutrition
type DailyTotals struct {
	Calories float64 `json:"calories"`
	Protein  float64 `json:"protein"`
	Carbs    float64 `json:"carbs"`
	Fat      float64 `json:"fat"`
	Fibre    float64 `json:"fibre"`
}

// HandleGetDiary returns diary entries for a date
func HandleGetDiary(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	entries, err := getDiaryEntries(user.ID, date)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Calculate totals
	var totals DailyTotals
	for _, entry := range entries {
		totals.Calories += entry.Calories
		totals.Protein += entry.Protein
		totals.Carbs += entry.Carbs
		totals.Fat += entry.Fat
		totals.Fibre += entry.Fibre
	}

	response := DiaryResponse{
		Date:    date,
		Entries: entries,
		Totals:  totals,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func getDiaryEntries(userID int64, date string) ([]DiaryEntry, error) {
	rows, err := database.DB.Query(`
		SELECT 
			d.id, d.user_id, d.date, d.meal, d.food_id, d.recipe_id,
			d.quantity_grams, d.calories, d.protein, d.carbs, d.fat, d.fibre,
			d.created_at, d.updated_at,
			COALESCE(f.name, '') as food_name,
			COALESCE(r.name, '') as recipe_name
		FROM diary_entries d
		LEFT JOIN foods f ON d.food_id = f.id
		LEFT JOIN recipes r ON d.recipe_id = r.id
		WHERE d.user_id = ? AND d.date = ?
		ORDER BY 
			CASE d.meal 
				WHEN 'breakfast' THEN 1 
				WHEN 'lunch' THEN 2 
				WHEN 'dinner' THEN 3 
				WHEN 'snacks' THEN 4 
			END,
			d.created_at
	`, userID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []DiaryEntry
	for rows.Next() {
		var e DiaryEntry
		var foodID, recipeID sql.NullInt64
		var createdAt, updatedAt time.Time

		err := rows.Scan(
			&e.ID, &e.UserID, &e.Date, &e.Meal, &foodID, &recipeID,
			&e.QuantityGrams, &e.Calories, &e.Protein, &e.Carbs, &e.Fat, &e.Fibre,
			&createdAt, &updatedAt, &e.FoodName, &e.RecipeName,
		)
		if err != nil {
			return nil, err
		}

		if foodID.Valid {
			e.FoodID = &foodID.Int64
		}
		if recipeID.Valid {
			e.RecipeID = &recipeID.Int64
		}
		e.CreatedAt = createdAt.Format(time.RFC3339)
		e.UpdatedAt = updatedAt.Format(time.RFC3339)

		entries = append(entries, e)
	}

	if entries == nil {
		entries = []DiaryEntry{}
	}

	return entries, nil
}

// HandleCreateDiaryEntry adds a new diary entry
func HandleCreateDiaryEntry(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var input struct {
		Date          string  `json:"date"`
		Meal          string  `json:"meal"`
		FoodID        *int64  `json:"food_id"`
		RecipeID      *int64  `json:"recipe_id"`
		QuantityGrams float64 `json:"quantity_grams"`
		Calories      float64 `json:"calories"`
		Protein       float64 `json:"protein"`
		Carbs         float64 `json:"carbs"`
		Fat           float64 `json:"fat"`
		Fibre         float64 `json:"fibre"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate
	if input.Date == "" {
		input.Date = time.Now().Format("2006-01-02")
	}
	if input.Meal == "" {
		http.Error(w, "Meal is required", http.StatusBadRequest)
		return
	}
	if input.FoodID == nil && input.RecipeID == nil {
		http.Error(w, "Either food_id or recipe_id is required", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`
		INSERT INTO diary_entries (user_id, date, meal, food_id, recipe_id, quantity_grams, calories, protein, carbs, fat, fibre)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, user.ID, input.Date, input.Meal, input.FoodID, input.RecipeID,
		input.QuantityGrams, input.Calories, input.Protein, input.Carbs, input.Fat, input.Fibre)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	entryID, _ := result.LastInsertId()

	// Return the created entry
	entry := DiaryEntry{
		ID:            entryID,
		UserID:        user.ID,
		Date:          input.Date,
		Meal:          input.Meal,
		FoodID:        input.FoodID,
		RecipeID:      input.RecipeID,
		QuantityGrams: input.QuantityGrams,
		Calories:      input.Calories,
		Protein:       input.Protein,
		Carbs:         input.Carbs,
		Fat:           input.Fat,
		Fibre:         input.Fibre,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(entry)
}

// HandleUpdateDiaryEntry updates an existing entry
func HandleUpdateDiaryEntry(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid entry ID", http.StatusBadRequest)
		return
	}

	// Verify ownership
	var ownerID int64
	err = database.DB.QueryRow("SELECT user_id FROM diary_entries WHERE id = ?", id).Scan(&ownerID)
	if err == sql.ErrNoRows {
		http.Error(w, "Entry not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if ownerID != user.ID {
		http.Error(w, "Not authorized", http.StatusForbidden)
		return
	}

	var input struct {
		QuantityGrams *float64 `json:"quantity_grams"`
		Calories      *float64 `json:"calories"`
		Protein       *float64 `json:"protein"`
		Carbs         *float64 `json:"carbs"`
		Fat           *float64 `json:"fat"`
		Fibre         *float64 `json:"fibre"`
		Meal          *string  `json:"meal"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Build update query
	query := "UPDATE diary_entries SET updated_at = CURRENT_TIMESTAMP"
	args := []interface{}{}

	if input.QuantityGrams != nil {
		query += ", quantity_grams = ?"
		args = append(args, *input.QuantityGrams)
	}
	if input.Calories != nil {
		query += ", calories = ?"
		args = append(args, *input.Calories)
	}
	if input.Protein != nil {
		query += ", protein = ?"
		args = append(args, *input.Protein)
	}
	if input.Carbs != nil {
		query += ", carbs = ?"
		args = append(args, *input.Carbs)
	}
	if input.Fat != nil {
		query += ", fat = ?"
		args = append(args, *input.Fat)
	}
	if input.Fibre != nil {
		query += ", fibre = ?"
		args = append(args, *input.Fibre)
	}
	if input.Meal != nil {
		query += ", meal = ?"
		args = append(args, *input.Meal)
	}

	query += " WHERE id = ?"
	args = append(args, id)

	_, err = database.DB.Exec(query, args...)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success": true}`))
}

// HandleDeleteDiaryEntry removes an entry
func HandleDeleteDiaryEntry(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid entry ID", http.StatusBadRequest)
		return
	}

	// Delete only if owned by user
	result, err := database.DB.Exec("DELETE FROM diary_entries WHERE id = ? AND user_id = ?", id, user.ID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		http.Error(w, "Entry not found or not authorized", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleGetDiaryRange returns entries for a date range (for banking calculation)
func HandleGetDiaryRange(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fromDate := r.URL.Query().Get("from")
	toDate := r.URL.Query().Get("to")

	if fromDate == "" || toDate == "" {
		http.Error(w, "from and to dates are required", http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query(`
		SELECT date, SUM(calories) as total_calories
		FROM diary_entries
		WHERE user_id = ? AND date >= ? AND date <= ?
		GROUP BY date
		ORDER BY date
	`, user.ID, fromDate, toDate)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type DaySummary struct {
		Date     string  `json:"date"`
		Calories float64 `json:"calories"`
	}

	var days []DaySummary
	for rows.Next() {
		var d DaySummary
		if err := rows.Scan(&d.Date, &d.Calories); err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		days = append(days, d)
	}

	if days == nil {
		days = []DaySummary{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(days)
}
