package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cals/internal/database"
	"cals/internal/fatsecret"
	"cals/internal/models"
)

var FatSecretClient *fatsecret.Client

// FoodSearchResult represents a food in search results
type FoodSearchResult struct {
	ID              int64    `json:"id"`
	FatSecretID     string   `json:"fatsecret_id,omitempty"`
	Name            string   `json:"name"`
	Brand           string   `json:"brand,omitempty"`
	CaloriesPer100g float64  `json:"calories_per_100g"`
	ServingName     string   `json:"serving_name,omitempty"`
	ServingGrams    float64  `json:"serving_grams,omitempty"`
	IsLocal         bool     `json:"is_local"`
	IsEdited        bool     `json:"is_edited"`
}

// HandleSearchFoods searches local DB first, then FatSecret API
func HandleSearchFoods(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" || len(query) < 2 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]FoodSearchResult{})
		return
	}

	var results []FoodSearchResult

	// Search local database first (fuzzy match)
	localResults, err := searchLocalFoods(query)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	results = append(results, localResults...)

	// If we have fewer than 10 local results, search FatSecret
	if len(results) < 10 && FatSecretClient != nil {
		apiResults, err := searchFatSecret(query, 20-len(results))
		if err != nil {
			// Log error but don't fail - return local results
		} else {
			// Filter out duplicates (same fatsecret_id already in local)
			for _, apiResult := range apiResults {
				isDuplicate := false
				for _, local := range localResults {
					if local.FatSecretID == apiResult.FatSecretID {
						isDuplicate = true
						break
					}
				}
				if !isDuplicate {
					results = append(results, apiResult)
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func searchLocalFoods(query string) ([]FoodSearchResult, error) {
	searchPattern := "%" + strings.ToLower(query) + "%"

	rows, err := database.DB.Query(`
		SELECT id, fatsecret_id, name, brand, calories_per_100g, serving_name, serving_grams, is_edited
		FROM foods
		WHERE LOWER(name) LIKE ? OR LOWER(brand) LIKE ?
		ORDER BY 
			CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END,
			name
		LIMIT 20
	`, searchPattern, searchPattern, strings.ToLower(query)+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []FoodSearchResult
	for rows.Next() {
		var r FoodSearchResult
		var fatSecretID, brand, servingName sql.NullString
		var servingGrams sql.NullFloat64
		err := rows.Scan(&r.ID, &fatSecretID, &r.Name, &brand, &r.CaloriesPer100g, &servingName, &servingGrams, &r.IsEdited)
		if err != nil {
			return nil, err
		}
		if fatSecretID.Valid {
			r.FatSecretID = fatSecretID.String
		}
		if brand.Valid {
			r.Brand = brand.String
		}
		if servingName.Valid {
			r.ServingName = servingName.String
		}
		if servingGrams.Valid {
			r.ServingGrams = servingGrams.Float64
		}
		r.IsLocal = true
		results = append(results, r)
	}

	return results, nil
}

func searchFatSecret(query string, maxResults int) ([]FoodSearchResult, error) {
	foods, err := FatSecretClient.SearchFoods(query, maxResults)
	if err != nil {
		return nil, err
	}

	var results []FoodSearchResult
	for _, food := range foods {
		calories := parseCaloriesFromDescription(food.FoodDescription)

		results = append(results, FoodSearchResult{
			FatSecretID:     food.FoodID,
			Name:            food.FoodName,
			Brand:           food.BrandName,
			CaloriesPer100g: calories,
			IsLocal:         false,
			IsEdited:        false,
		})
	}

	return results, nil
}

func parseCaloriesFromDescription(desc string) float64 {
	parts := strings.Split(desc, "|")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "Calories:") {
			calPart := strings.TrimPrefix(part, "Calories:")
			calPart = strings.TrimSpace(calPart)
			calPart = strings.TrimSuffix(calPart, "kcal")
			if cal, err := strconv.ParseFloat(calPart, 64); err == nil {
				return cal
			}
		}
	}
	return 0
}

// HandleGetFood gets a food by ID, fetching from FatSecret if needed
func HandleGetFood(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	
	if strings.HasPrefix(idStr, "fs_") {
		fatSecretID := strings.TrimPrefix(idStr, "fs_")
		food, err := fetchAndCacheFatSecretFood(fatSecretID)
		if err != nil {
			http.Error(w, "Failed to fetch food: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(food)
		return
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid food ID", http.StatusBadRequest)
		return
	}

	food, err := getLocalFood(id)
	if err == sql.ErrNoRows {
		http.Error(w, "Food not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(food)
}

func getLocalFood(id int64) (*models.Food, error) {
	var food models.Food
	var fatSecretID, brand, servingName sql.NullString
	var servingGrams sql.NullFloat64

	err := database.DB.QueryRow(`
		SELECT id, fatsecret_id, name, brand, calories_per_100g, protein_per_100g,
		       carbs_per_100g, fat_per_100g, fibre_per_100g, serving_name, serving_grams,
		       is_edited, created_at, updated_at
		FROM foods WHERE id = ?
	`, id).Scan(
		&food.ID, &fatSecretID, &food.Name, &brand,
		&food.CaloriesPer100g, &food.ProteinPer100g, &food.CarbsPer100g,
		&food.FatPer100g, &food.FibrePer100g, &servingName, &servingGrams,
		&food.IsEdited, &food.CreatedAt, &food.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	food.FatSecretID = fatSecretID
	food.Brand = brand
	food.ServingName = servingName
	food.ServingGrams = servingGrams

	// Get servings from food_servings table (for FatSecret foods)
	rows, err := database.DB.Query(`
		SELECT id, food_id, fatsecret_serving_id, description, grams
		FROM food_servings WHERE food_id = ?
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var s models.FoodServing
		var fsServingID sql.NullString
		err := rows.Scan(&s.ID, &s.FoodID, &fsServingID, &s.Description, &s.Grams)
		if err != nil {
			return nil, err
		}
		s.FatSecretServingID = fsServingID
		food.Servings = append(food.Servings, s)
	}

	return &food, nil
}

func fetchAndCacheFatSecretFood(fatSecretID string) (*models.Food, error) {
	var existingID int64
	err := database.DB.QueryRow(`SELECT id FROM foods WHERE fatsecret_id = ?`, fatSecretID).Scan(&existingID)
	if err == nil {
		return getLocalFood(existingID)
	}

	foodDetail, err := FatSecretClient.GetFood(fatSecretID)
	if err != nil {
		return nil, err
	}

	servingsData, err := FatSecretClient.ParseServings(foodDetail.Servings.Serving)
	if err != nil {
		return nil, err
	}

	var caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fibrePer100g float64
	var servings []models.FoodServing

	for _, s := range servingsData {
		grams := parseFloat(s.MetricServingAmount)
		calories := parseFloat(s.Calories)
		protein := parseFloat(s.Protein)
		carbs := parseFloat(s.Carbohydrate)
		fat := parseFloat(s.Fat)
		fibre := parseFloat(s.Fiber)

		if grams == 100 {
			caloriesPer100g = calories
			proteinPer100g = protein
			carbsPer100g = carbs
			fatPer100g = fat
			fibrePer100g = fibre
		}

		if grams > 0 {
			servings = append(servings, models.FoodServing{
				FatSecretServingID: sql.NullString{String: s.ServingID, Valid: true},
				Description:        s.ServingDescription,
				Grams:              grams,
			})
		}
	}

	if caloriesPer100g == 0 && len(servingsData) > 0 {
		for _, s := range servingsData {
			grams := parseFloat(s.MetricServingAmount)
			if grams > 0 {
				multiplier := 100 / grams
				caloriesPer100g = parseFloat(s.Calories) * multiplier
				proteinPer100g = parseFloat(s.Protein) * multiplier
				carbsPer100g = parseFloat(s.Carbohydrate) * multiplier
				fatPer100g = parseFloat(s.Fat) * multiplier
				fibrePer100g = parseFloat(s.Fiber) * multiplier
				break
			}
		}
	}

	result, err := database.DB.Exec(`
		INSERT INTO foods (fatsecret_id, name, brand, calories_per_100g, protein_per_100g,
		                   carbs_per_100g, fat_per_100g, fibre_per_100g, is_edited)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
	`, fatSecretID, foodDetail.FoodName, nullString(foodDetail.BrandName),
		caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fibrePer100g)
	if err != nil {
		return nil, err
	}

	foodID, _ := result.LastInsertId()

	for i := range servings {
		servings[i].FoodID = foodID
		result, err := database.DB.Exec(`
			INSERT INTO food_servings (food_id, fatsecret_serving_id, description, grams)
			VALUES (?, ?, ?, ?)
		`, foodID, servings[i].FatSecretServingID, servings[i].Description, servings[i].Grams)
		if err != nil {
			continue
		}
		servings[i].ID, _ = result.LastInsertId()
	}

	return getLocalFood(foodID)
}

func parseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func nullFloat(f float64) sql.NullFloat64 {
	if f == 0 {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: f, Valid: true}
}

// HandleUpdateFood updates a food's nutritional values
func HandleUpdateFood(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid food ID", http.StatusBadRequest)
		return
	}

	var updates struct {
		Name            *string  `json:"name"`
		Brand           *string  `json:"brand"`
		CaloriesPer100g *float64 `json:"calories_per_100g"`
		ProteinPer100g  *float64 `json:"protein_per_100g"`
		CarbsPer100g    *float64 `json:"carbs_per_100g"`
		FatPer100g      *float64 `json:"fat_per_100g"`
		FibrePer100g    *float64 `json:"fibre_per_100g"`
		ServingName     *string  `json:"serving_name"`
		ServingGrams    *float64 `json:"serving_grams"`
	}

	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	query := "UPDATE foods SET is_edited = 1, updated_at = ?"
	args := []interface{}{time.Now()}

	if updates.Name != nil {
		query += ", name = ?"
		args = append(args, *updates.Name)
	}
	if updates.Brand != nil {
		query += ", brand = ?"
		args = append(args, *updates.Brand)
	}
	if updates.CaloriesPer100g != nil {
		query += ", calories_per_100g = ?"
		args = append(args, *updates.CaloriesPer100g)
	}
	if updates.ProteinPer100g != nil {
		query += ", protein_per_100g = ?"
		args = append(args, *updates.ProteinPer100g)
	}
	if updates.CarbsPer100g != nil {
		query += ", carbs_per_100g = ?"
		args = append(args, *updates.CarbsPer100g)
	}
	if updates.FatPer100g != nil {
		query += ", fat_per_100g = ?"
		args = append(args, *updates.FatPer100g)
	}
	if updates.FibrePer100g != nil {
		query += ", fibre_per_100g = ?"
		args = append(args, *updates.FibrePer100g)
	}
	if updates.ServingName != nil {
		query += ", serving_name = ?"
		args = append(args, *updates.ServingName)
	}
	if updates.ServingGrams != nil {
		query += ", serving_grams = ?"
		args = append(args, *updates.ServingGrams)
	}

	query += " WHERE id = ?"
	args = append(args, id)

	_, err = database.DB.Exec(query, args...)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	food, err := getLocalFood(id)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(food)
}

// HandleCreateFood creates a manual food entry
func HandleCreateFood(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name            string   `json:"name"`
		Brand           string   `json:"brand"`
		CaloriesPer100g float64  `json:"calories_per_100g"`
		ProteinPer100g  float64  `json:"protein_per_100g"`
		CarbsPer100g    float64  `json:"carbs_per_100g"`
		FatPer100g      float64  `json:"fat_per_100g"`
		FibrePer100g    float64  `json:"fibre_per_100g"`
		ServingName     string   `json:"serving_name"`
		ServingGrams    float64  `json:"serving_grams"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if input.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`
		INSERT INTO foods (name, brand, calories_per_100g, protein_per_100g,
		                   carbs_per_100g, fat_per_100g, fibre_per_100g,
		                   serving_name, serving_grams, is_edited)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
	`, input.Name, nullString(input.Brand), input.CaloriesPer100g, input.ProteinPer100g,
		input.CarbsPer100g, input.FatPer100g, input.FibrePer100g,
		nullString(input.ServingName), nullFloat(input.ServingGrams))
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	foodID, _ := result.LastInsertId()
	food, _ := getLocalFood(foodID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(food)
}
