package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"math"
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
	ID                 int64   `json:"id"`
	Description        string  `json:"description"`
	Grams              float64 `json:"grams"`
	FatSecretServingID string  `json:"fatsecret_serving_id,omitempty"`
}

// servingInput is a named, gram-backed measure sent by the food editor. Grams
// stay canonical: a measure is only ever a name for a number of grams, never a
// conversion factor between foods, so an invalid one is refused rather than
// guessed.
type servingInput struct {
	Description string  `json:"description"`
	Grams       float64 `json:"grams"`
}

// maxCustomServings caps a food's user-defined measures. The limit keeps the
// quantity picker scrollable on a phone rather than being a domain rule.
const maxCustomServings = 20

// validateCustomServings returns an error message for the first invalid
// measure, or "" when every measure is usable.
func validateCustomServings(servings []servingInput) string {
	if len(servings) > maxCustomServings {
		return "A food can have at most " + strconv.Itoa(maxCustomServings) + " named measures"
	}
	seen := make(map[string]struct{}, len(servings))
	for _, serving := range servings {
		name := strings.TrimSpace(serving.Description)
		if name == "" {
			return "Every named measure needs a description"
		}
		if !(serving.Grams > 0) {
			return "The measure " + strconv.Quote(name) + " needs a weight in grams greater than zero"
		}
		key := strings.ToLower(name)
		if _, duplicate := seen[key]; duplicate {
			return "Duplicate named measure: " + name
		}
		seen[key] = struct{}{}
	}
	return ""
}

func servingToResponse(servings []models.FoodServing) []ServingResponse {
	responses := make([]ServingResponse, 0, len(servings))
	for _, s := range servings {
		response := ServingResponse{
			ID:          s.ID,
			Description: s.Description,
			Grams:       s.Grams,
		}
		if s.FatSecretServingID.Valid {
			response.FatSecretServingID = s.FatSecretServingID.String
		}
		responses = append(responses, response)
	}
	return responses
}

// loadServingsForFoods returns measures for several foods at once,
// FatSecret-provided ones first and then the household's own named measures in
// the order they were added.
func loadServingsForFoods(foodIDs []int64) (map[int64][]models.FoodServing, error) {
	byFood := make(map[int64][]models.FoodServing, len(foodIDs))
	if len(foodIDs) == 0 {
		return byFood, nil
	}

	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(foodIDs)), ",")
	args := make([]interface{}, len(foodIDs))
	for i, id := range foodIDs {
		args[i] = id
	}

	rows, err := database.DB.Query(`
		SELECT food_id, id, description, grams, fatsecret_serving_id
		FROM food_servings
		WHERE food_id IN (`+placeholders+`)
		ORDER BY food_id, CASE WHEN fatsecret_serving_id IS NULL THEN 1 ELSE 0 END, id
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var s models.FoodServing
		if err := rows.Scan(&s.FoodID, &s.ID, &s.Description, &s.Grams, &s.FatSecretServingID); err != nil {
			return nil, err
		}
		byFood[s.FoodID] = append(byFood[s.FoodID], s)
	}
	return byFood, rows.Err()
}

// loadFoodServings returns one food's measures.
func loadFoodServings(foodID int64) ([]models.FoodServing, error) {
	byFood, err := loadServingsForFoods([]int64{foodID})
	if err != nil {
		return nil, err
	}
	return byFood[foodID], nil
}

// replaceCustomServings swaps a food's user-defined measures in one
// transaction. FatSecret-provided rows (fatsecret_serving_id IS NOT NULL) are
// never touched: they come from the food source, not from the household.
func replaceCustomServings(tx *sql.Tx, foodID int64, servings []servingInput) error {
	if _, err := tx.Exec(`
		DELETE FROM food_servings WHERE food_id = ? AND fatsecret_serving_id IS NULL
	`, foodID); err != nil {
		return err
	}
	for _, serving := range servings {
		if _, err := tx.Exec(`
			INSERT INTO food_servings (food_id, description, grams) VALUES (?, ?, ?)
		`, foodID, strings.TrimSpace(serving.Description), serving.Grams); err != nil {
			return err
		}
	}
	return nil
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

	resp.Servings = servingToResponse(f.Servings)

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
		var localFoods []models.Food
		var localIDs []int64
		for rows.Next() {
			var f models.Food
			err := rows.Scan(&f.ID, &f.FatSecretID, &f.Name, &f.Brand,
				&f.CaloriesPer100g, &f.ProteinPer100g, &f.CarbsPer100g,
				&f.FatPer100g, &f.FibrePer100g, &f.ServingName, &f.ServingGrams, &f.IsEdited)
			if err == nil {
				localFoods = append(localFoods, f)
				localIDs = append(localIDs, f.ID)
			}
		}

		// The diary's Add sheet offers serving choices straight from search, so
		// each local result carries its named measures.
		servingsByFood, err := loadServingsForFoods(localIDs)
		if err != nil {
			log.Printf("could not load food measures for search results: %v", err)
			servingsByFood = map[int64][]models.FoodServing{}
		}
		for i := range localFoods {
			localFoods[i].Servings = servingsByFood[localFoods[i].ID]
			results = append(results, foodToResponse(&localFoods[i]))
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

	if servings, err := loadFoodServings(id); err == nil {
		f.Servings = servings
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
		if servings, err := loadFoodServings(f.ID); err == nil {
			f.Servings = servings
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
		Name            string         `json:"name"`
		CaloriesPer100g float64        `json:"calories_per_100g"`
		ProteinPer100g  float64        `json:"protein_per_100g"`
		CarbsPer100g    float64        `json:"carbs_per_100g"`
		FatPer100g      float64        `json:"fat_per_100g"`
		FibrePer100g    float64        `json:"fibre_per_100g"`
		ServingName     string         `json:"serving_name"`
		ServingGrams    float64        `json:"serving_grams"`
		Servings        []servingInput `json:"servings"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(input.Name) == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}
	for _, value := range []float64{
		input.CaloriesPer100g, input.ProteinPer100g, input.CarbsPer100g,
		input.FatPer100g, input.FibrePer100g,
	} {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			http.Error(w, "Nutrition values must be finite and 0 or more", http.StatusBadRequest)
			return
		}
	}
	if message := validateCustomServings(input.Servings); message != "" {
		http.Error(w, message, http.StatusBadRequest)
		return
	}
	if input.ServingName != "" && !(input.ServingGrams > 0) {
		http.Error(w, "The preferred serving needs a weight in grams greater than zero", http.StatusBadRequest)
		return
	}

	tx, err := database.DB.BeginTx(r.Context(), nil)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var existingID int64
	if err := tx.QueryRow(`SELECT id FROM foods WHERE id = ?`, id).Scan(&existingID); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Food not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if _, err := tx.Exec(`
		UPDATE foods SET 
			name = ?, calories_per_100g = ?, protein_per_100g = ?, carbs_per_100g = ?,
			fat_per_100g = ?, fibre_per_100g = ?, serving_name = ?, serving_grams = ?,
			is_edited = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, strings.TrimSpace(input.Name), input.CaloriesPer100g, input.ProteinPer100g, input.CarbsPer100g,
		input.FatPer100g, input.FibrePer100g, input.ServingName, input.ServingGrams, id); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if err := replaceCustomServings(tx, id, input.Servings); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if err := recalculateRecipesUsingFood(tx, id); err != nil {
		log.Printf("could not recalculate recipes using food %d: %v", id, err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Return updated food
	f, err := getFoodByID(id)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(foodToResponse(f))
}

// getFoodByID loads one food row plus its measures.
func getFoodByID(id int64) (*models.Food, error) {
	var f models.Food
	err := database.DB.QueryRow(`
		SELECT id, fatsecret_id, name, brand, calories_per_100g, protein_per_100g,
		       carbs_per_100g, fat_per_100g, fibre_per_100g, serving_name, serving_grams, is_edited
		FROM foods WHERE id = ?
	`, id).Scan(&f.ID, &f.FatSecretID, &f.Name, &f.Brand,
		&f.CaloriesPer100g, &f.ProteinPer100g, &f.CarbsPer100g,
		&f.FatPer100g, &f.FibrePer100g, &f.ServingName, &f.ServingGrams, &f.IsEdited)
	if err != nil {
		return nil, err
	}
	if servings, err := loadFoodServings(id); err == nil {
		f.Servings = servings
	}
	return &f, nil
}

// HandleCreateFood creates a new custom food
func HandleCreateFood(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name            string         `json:"name"`
		Brand           string         `json:"brand"`
		CaloriesPer100g float64        `json:"calories_per_100g"`
		ProteinPer100g  float64        `json:"protein_per_100g"`
		CarbsPer100g    float64        `json:"carbs_per_100g"`
		FatPer100g      float64        `json:"fat_per_100g"`
		FibrePer100g    float64        `json:"fibre_per_100g"`
		ServingName     string         `json:"serving_name"`
		ServingGrams    float64        `json:"serving_grams"`
		Servings        []servingInput `json:"servings"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(input.Name) == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}
	if message := validateCustomServings(input.Servings); message != "" {
		http.Error(w, message, http.StatusBadRequest)
		return
	}
	if input.ServingName != "" && !(input.ServingGrams > 0) {
		http.Error(w, "The preferred serving needs a weight in grams greater than zero", http.StatusBadRequest)
		return
	}

	tx, err := database.DB.BeginTx(r.Context(), nil)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		INSERT INTO foods (name, brand, calories_per_100g, protein_per_100g, carbs_per_100g,
		                   fat_per_100g, fibre_per_100g, serving_name, serving_grams)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, strings.TrimSpace(input.Name), input.Brand, input.CaloriesPer100g, input.ProteinPer100g,
		input.CarbsPer100g, input.FatPer100g, input.FibrePer100g,
		input.ServingName, input.ServingGrams)

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	id, err := result.LastInsertId()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if err := replaceCustomServings(tx, id, input.Servings); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	food, err := getFoodByID(id)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(foodToResponse(food))
}

// HandleGetCustomFoods returns all custom (non-fatsecret) foods, each with the
// named gram-backed measures the quantity picker can offer.
func HandleGetCustomFoods(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT id, fatsecret_id, name, brand, calories_per_100g, protein_per_100g,
		       carbs_per_100g, fat_per_100g, fibre_per_100g, serving_name, serving_grams, is_edited
		FROM foods 
		WHERE fatsecret_id IS NULL
		ORDER BY name ASC
	`)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var customFoods []models.Food
	var customIDs []int64
	for rows.Next() {
		var f models.Food
		if err := rows.Scan(&f.ID, &f.FatSecretID, &f.Name, &f.Brand,
			&f.CaloriesPer100g, &f.ProteinPer100g, &f.CarbsPer100g,
			&f.FatPer100g, &f.FibrePer100g, &f.ServingName, &f.ServingGrams, &f.IsEdited); err != nil {
			continue
		}
		customFoods = append(customFoods, f)
		customIDs = append(customIDs, f.ID)
	}

	servingsByFood, err := loadServingsForFoods(customIDs)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	foods := []FoodResponse{}
	for i := range customFoods {
		customFoods[i].Servings = servingsByFood[customFoods[i].ID]
		foods = append(foods, foodToResponse(&customFoods[i]))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(foods)
}

// HandleDeleteFood deletes a custom food
func HandleDeleteFood(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Only allow deleting custom foods (not fatsecret cached)
	var fatsecretID sql.NullString
	err = database.DB.QueryRow(`SELECT fatsecret_id FROM foods WHERE id = ?`, id).Scan(&fatsecretID)
	if err != nil {
		http.Error(w, "Food not found", http.StatusNotFound)
		return
	}
	if fatsecretID.Valid {
		http.Error(w, "Cannot delete cached FatSecret foods", http.StatusForbidden)
		return
	}

	_, err = database.DB.Exec(`DELETE FROM foods WHERE id = ?`, id)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
