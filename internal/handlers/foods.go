package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"cals/internal/database"
	"cals/internal/fatsecret"
	"cals/internal/models"
)

var FatSecretClient *fatsecret.Client

// FoodResponse is a clean JSON response structure
type FoodResponse struct {
	ID              interface{}       `json:"id"`
	FatSecretID     string            `json:"fatsecret_id,omitempty"`
	Name            string            `json:"name"`
	Brand           string            `json:"brand,omitempty"`
	CaloriesPer100g float64           `json:"calories_per_100g"`
	ProteinPer100g  float64           `json:"protein_per_100g"`
	CarbsPer100g    float64           `json:"carbs_per_100g"`
	FatPer100g      float64           `json:"fat_per_100g"`
	FibrePer100g    float64           `json:"fibre_per_100g"`
	ServingName     string            `json:"serving_name,omitempty"`
	ServingGrams    float64           `json:"serving_grams,omitempty"`
	IsEdited        bool              `json:"is_edited"`
	Servings        []ServingResponse `json:"servings,omitempty"`
}

type ServingResponse struct {
	ID          int64   `json:"id"`
	Description string  `json:"description"`
	Grams       float64 `json:"grams"`
}

func foodToResponse(f *models.Food) FoodResponse {
	resp := FoodResponse{
		ID:              f.ID,
		Name:            f.Name,
		CaloriesPer100g: f.CaloriesPer100g,
		ProteinPer100g:  f.ProteinPer100g,
		CarbsPer100g:    f.CarbsPer100g,
		FatPer100g:      f.FatPer100g,
		FibrePer100g:    f.FibrePer100g,
		IsEdited:        f.IsEdited,
	}

	if f.FatSecretID.Valid {
		resp.FatSecretID = f.FatSecretID.String
	}
	if f.Brand.Valid {
		resp.Brand = f.Brand.String
	}
	if f.ServingName.Valid {
		resp.ServingName = f.ServingName.String
	}
	if f.ServingGrams.Valid {
		resp.ServingGrams = f.ServingGrams.Float64
	}

	for _, s := range f.Servings {
		resp.Servings = append(resp.Servings, ServingResponse{
			ID:          s.ID,
			Description: s.Description,
			Grams:       s.Grams,
		})
	}

	return resp
}

// parseStringFloat safely parses a string to float64, returns 0 on error
func parseStringFloat(s string) float64 {
	if s == "" {
		return 0
	}
	val, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return 0
	}
	return val
}

// HandleSearchFoods searches local DB first, then FatSecret API
func HandleSearchFoods(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if len(query) < 2 {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
		return
	}

	var results []FoodResponse

	// Search local database first
	rows, err := database.DB.Query(`
		SELECT id, fatsecret_id, name, brand, calories_per_100g, protein_per_100g, 
		       carbs_per_100g, fat_per_100g, fibre_per_100g, serving_name, serving_grams, is_edited
		FROM foods 
		WHERE name LIKE ? 
		ORDER BY 
			CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
			name
		LIMIT 20
	`, "%"+query+"%", query+"%")

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var f models.Food
			err := rows.Scan(&f.ID, &f.FatSecretID, &f.Name, &f.Brand,
				&f.CaloriesPer100g, &f.ProteinPer100g, &f.CarbsPer100g,
				&f.FatPer100g, &f.FibrePer100g, &f.ServingName, &f.ServingGrams, &f.IsEdited)
			if err == nil {
				results = append(results, foodToResponse(&f))
			}
		}
	}

	// If we have fewer than 10 local results and FatSecret is configured, search API
	if len(results) < 10 && FatSecretClient != nil {
		apiResults, err := FatSecretClient.SearchFoods(query, 20)
		if err != nil {
			log.Printf("FatSecret search error: %v", err)
		} else {
			// Add API results, avoiding duplicates
			localFSIDs := make(map[string]bool)
			for _, r := range results {
				if r.FatSecretID != "" {
					localFSIDs[r.FatSecretID] = true
				}
			}

			for _, apiFood := range apiResults {
				if !localFSIDs[apiFood.FoodID] {
					// Parse calories from description if available
					cals := parseCaloriesFromDescription(apiFood.FoodDescription)
					results = append(results, FoodResponse{
						ID:              "fs_" + apiFood.FoodID,
						FatSecretID:     apiFood.FoodID,
						Name:            apiFood.FoodName,
						Brand:           apiFood.BrandName,
						CaloriesPer100g: cals,
					})
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// parseCaloriesFromDescription extracts calories from FatSecret description
// Format is typically "Per 100g - Calories: 265kcal | Fat: 3.2g | Carbs: 49g | Protein: 9g"
func parseCaloriesFromDescription(desc string) float64 {
	// Simple extraction - look for "Calories: XXXkcal"
	if idx := strings.Index(desc, "Calories:"); idx >= 0 {
		rest := desc[idx+9:]
		parts := strings.Split(rest, "kcal")
		if len(parts) > 0 {
			return parseStringFloat(parts[0])
		}
	}
	return 0
}

// HandleGetFood returns a single food by ID
func HandleGetFood(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")

	// Check if it's a FatSecret ID (prefixed with "fs_")
	if strings.HasPrefix(idStr, "fs_") {
		fsID := strings.TrimPrefix(idStr, "fs_")
		handleGetFatSecretFood(w, fsID)
		return
	}

	// Local database food
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid food ID", http.StatusBadRequest)
		return
	}

	var f models.Food
	err = database.DB.QueryRow(`
		SELECT id, fatsecret_id, name, brand, calories_per_100g, protein_per_100g,
		       carbs_per_100g, fat_per_100g, fibre_per_100g, serving_name, serving_grams, is_edited
		FROM foods WHERE id = ?
	`, id).Scan(&f.ID, &f.FatSecretID, &f.Name, &f.Brand,
		&f.CaloriesPer100g, &f.ProteinPer100g, &f.CarbsPer100g,
		&f.FatPer100g, &f.FibrePer100g, &f.ServingName, &f.ServingGrams, &f.IsEdited)

	if err == sql.ErrNoRows {
		http.Error(w, "Food not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Get servings
	rows, err := database.DB.Query(`
		SELECT id, description, grams FROM food_servings WHERE food_id = ?
	`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var s models.FoodServing
			if rows.Scan(&s.ID, &s.Description, &s.Grams) == nil {
				f.Servings = append(f.Servings, s)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(foodToResponse(&f))
}

func handleGetFatSecretFood(w http.ResponseWriter, fsID string) {
	// First check if we have it cached locally
	var f models.Food
	err := database.DB.QueryRow(`
		SELECT id, fatsecret_id, name, brand, calories_per_100g, protein_per_100g,
		       carbs_per_100g, fat_per_100g, fibre_per_100g, serving_name, serving_grams, is_edited
		FROM foods WHERE fatsecret_id = ?
	`, fsID).Scan(&f.ID, &f.FatSecretID, &f.Name, &f.Brand,
		&f.CaloriesPer100g, &f.ProteinPer100g, &f.CarbsPer100g,
		&f.FatPer100g, &f.FibrePer100g, &f.ServingName, &f.ServingGrams, &f.IsEdited)

	if err == nil {
		// Found in local cache, get servings
		rows, err := database.DB.Query(`
			SELECT id, description, grams FROM food_servings WHERE food_id = ?
		`, f.ID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var s models.FoodServing
				if rows.Scan(&s.ID, &s.Description, &s.Grams) == nil {
					f.Servings = append(f.Servings, s)
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(foodToResponse(&f))
		return
	}

	// Not cached, fetch from FatSecret API
	if FatSecretClient == nil {
		http.Error(w, "FatSecret not configured", http.StatusServiceUnavailable)
		return
	}

	apiFood, err := FatSecretClient.GetFood(fsID)
	if err != nil {
		log.Printf("FatSecret GetFood error: %v", err)
		http.Error(w, "Failed to fetch food", http.StatusBadGateway)
		return
	}

	// Parse servings from raw JSON
	servings, err := FatSecretClient.ParseServings(apiFood.Servings.Serving)
	if err != nil {
		log.Printf("Failed to parse servings: %v", err)
		servings = []fatsecret.ServingDetail{}
	}

	// Calculate per-100g values from the first serving that has metric data
	var cals100, protein100, carbs100, fat100, fibre100 float64
	for _, s := range servings {
		metricAmount := parseStringFloat(s.MetricServingAmount)
		if metricAmount > 0 {
			factor := 100.0 / metricAmount
			cals100 = parseStringFloat(s.Calories) * factor
			protein100 = parseStringFloat(s.Protein) * factor
			carbs100 = parseStringFloat(s.Carbohydrate) * factor
			fat100 = parseStringFloat(s.Fat) * factor
			fibre100 = parseStringFloat(s.Fiber) * factor
			break
		}
	}

	// Cache in local database
	result, err := database.DB.Exec(`
		INSERT INTO foods (fatsecret_id, name, brand, calories_per_100g, protein_per_100g,
		                   carbs_per_100g, fat_per_100g, fibre_per_100g)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, apiFood.FoodID, apiFood.FoodName, apiFood.BrandName,
		cals100, protein100, carbs100, fat100, fibre100)

	if err != nil {
		log.Printf("Failed to cache food: %v", err)
		// Still return the food even if caching failed
		resp := FoodResponse{
			ID:              "fs_" + apiFood.FoodID,
			FatSecretID:     apiFood.FoodID,
			Name:            apiFood.FoodName,
			Brand:           apiFood.BrandName,
			CaloriesPer100g: cals100,
			ProteinPer100g:  protein100,
			CarbsPer100g:    carbs100,
			FatPer100g:      fat100,
			FibrePer100g:    fibre100,
		}
		for _, s := range servings {
			metricAmount := parseStringFloat(s.MetricServingAmount)
			if metricAmount > 0 {
				resp.Servings = append(resp.Servings, ServingResponse{
					Description: s.ServingDescription,
					Grams:       metricAmount,
				})
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	localID, _ := result.LastInsertId()

	// Cache servings
	var respServings []ServingResponse
	for _, s := range servings {
		metricAmount := parseStringFloat(s.MetricServingAmount)
		if metricAmount > 0 {
			database.DB.Exec(`
				INSERT INTO food_servings (food_id, fatsecret_serving_id, description, grams)
				VALUES (?, ?, ?, ?)
			`, localID, s.ServingID, s.ServingDescription, metricAmount)

			respServings = append(respServings, ServingResponse{
				Description: s.ServingDescription,
				Grams:       metricAmount,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(FoodResponse{
		ID:              localID,
		FatSecretID:     apiFood.FoodID,
		Name:            apiFood.FoodName,
		Brand:           apiFood.BrandName,
		CaloriesPer100g: cals100,
		ProteinPer100g:  protein100,
		CarbsPer100g:    carbs100,
		FatPer100g:      fat100,
		FibrePer100g:    fibre100,
		Servings:        respServings,
	})
}

// HandleUpdateFood updates a food's nutritional info
func HandleUpdateFood(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid food ID", http.StatusBadRequest)
		return
	}

	var input struct {
		Name            string  `json:"name"`
		CaloriesPer100g float64 `json:"calories_per_100g"`
		ProteinPer100g  float64 `json:"protein_per_100g"`
		CarbsPer100g    float64 `json:"carbs_per_100g"`
		FatPer100g      float64 `json:"fat_per_100g"`
		FibrePer100g    float64 `json:"fibre_per_100g"`
		ServingName     string  `json:"serving_name"`
		ServingGrams    float64 `json:"serving_grams"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`
		UPDATE foods SET 
			name = ?, calories_per_100g = ?, protein_per_100g = ?, carbs_per_100g = ?,
			fat_per_100g = ?, fibre_per_100g = ?, serving_name = ?, serving_grams = ?,
			is_edited = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, input.Name, input.CaloriesPer100g, input.ProteinPer100g, input.CarbsPer100g,
		input.FatPer100g, input.FibrePer100g, input.ServingName, input.ServingGrams, id)

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Return updated food
	var f models.Food
	database.DB.QueryRow(`
		SELECT id, fatsecret_id, name, brand, calories_per_100g, protein_per_100g,
		       carbs_per_100g, fat_per_100g, fibre_per_100g, serving_name, serving_grams, is_edited
		FROM foods WHERE id = ?
	`, id).Scan(&f.ID, &f.FatSecretID, &f.Name, &f.Brand,
		&f.CaloriesPer100g, &f.ProteinPer100g, &f.CarbsPer100g,
		&f.FatPer100g, &f.FibrePer100g, &f.ServingName, &f.ServingGrams, &f.IsEdited)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(foodToResponse(&f))
}

// HandleCreateFood creates a new custom food
func HandleCreateFood(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name            string  `json:"name"`
		Brand           string  `json:"brand"`
		CaloriesPer100g float64 `json:"calories_per_100g"`
		ProteinPer100g  float64 `json:"protein_per_100g"`
		CarbsPer100g    float64 `json:"carbs_per_100g"`
		FatPer100g      float64 `json:"fat_per_100g"`
		FibrePer100g    float64 `json:"fibre_per_100g"`
		ServingName     string  `json:"serving_name"`
		ServingGrams    float64 `json:"serving_grams"`
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
		INSERT INTO foods (name, brand, calories_per_100g, protein_per_100g, carbs_per_100g,
		                   fat_per_100g, fibre_per_100g, serving_name, serving_grams)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, input.Name, input.Brand, input.CaloriesPer100g, input.ProteinPer100g,
		input.CarbsPer100g, input.FatPer100g, input.FibrePer100g,
		input.ServingName, input.ServingGrams)

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(FoodResponse{
		ID:              id,
		Name:            input.Name,
		Brand:           input.Brand,
		CaloriesPer100g: input.CaloriesPer100g,
		ProteinPer100g:  input.ProteinPer100g,
		CarbsPer100g:    input.CarbsPer100g,
		FatPer100g:      input.FatPer100g,
		FibrePer100g:    input.FibrePer100g,
		ServingName:     input.ServingName,
		ServingGrams:    input.ServingGrams,
	})
}
