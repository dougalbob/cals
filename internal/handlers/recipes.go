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

// HandleListRecipes returns all recipes
func HandleListRecipes(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT r.id, r.name, r.description, r.image_filename, r.serves,
		       r.total_weight_grams, r.total_calories, r.created_by_user_id,
		       COALESCE(u.name, u.email) as created_by_name
		FROM recipes r
		LEFT JOIN users u ON r.created_by_user_id = u.id
		ORDER BY r.name
	`)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var recipes []models.Recipe
	for rows.Next() {
		var r models.Recipe
		var desc, img sql.NullString
		err := rows.Scan(&r.ID, &r.Name, &desc, &img, &r.Serves,
			&r.TotalWeightGrams, &r.TotalCalories, &r.CreatedByUserID, &r.CreatedByName)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if desc.Valid {
			r.Description = desc.String
		}
		if img.Valid {
			r.ImageFilename = img.String
		}
		recipes = append(recipes, r)
	}

	if recipes == nil {
		recipes = []models.Recipe{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipes)
}

// HandleGetRecipe returns a single recipe with all details
func HandleGetRecipe(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	recipe, err := getRecipeByID(id)
	if err == sql.ErrNoRows {
		http.Error(w, "Recipe not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipe)
}

func getRecipeByID(id int64) (*models.Recipe, error) {
	var r models.Recipe
	var desc, instructions, img sql.NullString

	err := database.DB.QueryRow(`
		SELECT r.id, r.name, r.description, r.instructions, r.image_filename, r.serves,
		       r.created_by_user_id, r.total_weight_grams, r.weight_is_manual,
		       r.total_calories, r.total_protein, r.total_carbs, r.total_fat, r.total_fibre,
		       r.created_at, r.updated_at, COALESCE(u.name, u.email) as created_by_name
		FROM recipes r
		LEFT JOIN users u ON r.created_by_user_id = u.id
		WHERE r.id = ?
	`, id).Scan(&r.ID, &r.Name, &desc, &instructions, &img, &r.Serves,
		&r.CreatedByUserID, &r.TotalWeightGrams, &r.WeightIsManual,
		&r.TotalCalories, &r.TotalProtein, &r.TotalCarbs, &r.TotalFat, &r.TotalFibre,
		&r.CreatedAt, &r.UpdatedAt, &r.CreatedByName)
	if err != nil {
		return nil, err
	}

	if desc.Valid {
		r.Description = desc.String
	}
	if instructions.Valid {
		r.Instructions = instructions.String
	}
	if img.Valid {
		r.ImageFilename = img.String
	}

	// Get food ingredients
	rows, err := database.DB.Query(`
		SELECT ri.id, ri.recipe_id, ri.food_id, f.name, ri.quantity_grams, ri.sort_order,
		       (f.calories_per_100g * ri.quantity_grams / 100) as calories
		FROM recipe_ingredients ri
		JOIN foods f ON ri.food_id = f.id
		WHERE ri.recipe_id = ?
		ORDER BY ri.sort_order, ri.id
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var ing models.RecipeIngredient
		err := rows.Scan(&ing.ID, &ing.RecipeID, &ing.FoodID, &ing.FoodName,
			&ing.QuantityGrams, &ing.SortOrder, &ing.Calories)
		if err != nil {
			return nil, err
		}
		r.Ingredients = append(r.Ingredients, ing)
	}

	// Get text ingredients
	textRows, err := database.DB.Query(`
		SELECT id, recipe_id, description, sort_order
		FROM recipe_text_ingredients
		WHERE recipe_id = ?
		ORDER BY sort_order, id
	`, id)
	if err != nil {
		return nil, err
	}
	defer textRows.Close()

	for textRows.Next() {
		var ti models.RecipeTextIngredient
		err := textRows.Scan(&ti.ID, &ti.RecipeID, &ti.Description, &ti.SortOrder)
		if err != nil {
			return nil, err
		}
		r.TextIngredients = append(r.TextIngredients, ti)
	}

	return &r, nil
}

// HandleCreateRecipe creates a new recipe
func HandleCreateRecipe(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var input struct {
		Name             string  `json:"name"`
		Description      string  `json:"description"`
		Instructions     string  `json:"instructions"`
		Serves           int     `json:"serves"`
		TotalWeightGrams float64 `json:"total_weight_grams"`
		WeightIsManual   bool    `json:"weight_is_manual"`
		Ingredients      []struct {
			FoodID        int64   `json:"food_id"`
			QuantityGrams float64 `json:"quantity_grams"`
			SortOrder     int     `json:"sort_order"`
		} `json:"ingredients"`
		TextIngredients []struct {
			Description string `json:"description"`
			SortOrder   int    `json:"sort_order"`
		} `json:"text_ingredients"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if input.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if input.Serves < 1 {
		input.Serves = 1
	}

	// Calculate totals from ingredients
	var totalCals, totalProtein, totalCarbs, totalFat, totalFibre, totalWeight float64
	for _, ing := range input.Ingredients {
		var cals, protein, carbs, fat, fibre float64
		err := database.DB.QueryRow(`
			SELECT calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fibre_per_100g
			FROM foods WHERE id = ?
		`, ing.FoodID).Scan(&cals, &protein, &carbs, &fat, &fibre)
		if err != nil {
			continue
		}
		multiplier := ing.QuantityGrams / 100
		totalCals += cals * multiplier
		totalProtein += protein * multiplier
		totalCarbs += carbs * multiplier
		totalFat += fat * multiplier
		totalFibre += fibre * multiplier
		totalWeight += ing.QuantityGrams
	}

	// Use manual weight if provided, otherwise calculated
	finalWeight := totalWeight
	if input.WeightIsManual && input.TotalWeightGrams > 0 {
		finalWeight = input.TotalWeightGrams
	}

	// Insert recipe
	result, err := database.DB.Exec(`
		INSERT INTO recipes (name, description, instructions, serves, created_by_user_id,
		                     total_weight_grams, weight_is_manual, total_calories,
		                     total_protein, total_carbs, total_fat, total_fibre)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, input.Name, input.Description, input.Instructions, input.Serves, user.ID,
		finalWeight, input.WeightIsManual, totalCals, totalProtein, totalCarbs, totalFat, totalFibre)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	recipeID, _ := result.LastInsertId()

	// Insert food ingredients
	for _, ing := range input.Ingredients {
		database.DB.Exec(`
			INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_grams, sort_order)
			VALUES (?, ?, ?, ?)
		`, recipeID, ing.FoodID, ing.QuantityGrams, ing.SortOrder)
	}

	// Insert text ingredients
	for _, ti := range input.TextIngredients {
		database.DB.Exec(`
			INSERT INTO recipe_text_ingredients (recipe_id, description, sort_order)
			VALUES (?, ?, ?)
		`, recipeID, ti.Description, ti.SortOrder)
	}

	recipe, _ := getRecipeByID(recipeID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(recipe)
}

// HandleUpdateRecipe updates an existing recipe
func HandleUpdateRecipe(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	var input struct {
		Name             string  `json:"name"`
		Description      string  `json:"description"`
		Instructions     string  `json:"instructions"`
		Serves           int     `json:"serves"`
		TotalWeightGrams float64 `json:"total_weight_grams"`
		WeightIsManual   bool    `json:"weight_is_manual"`
		Ingredients      []struct {
			FoodID        int64   `json:"food_id"`
			QuantityGrams float64 `json:"quantity_grams"`
			SortOrder     int     `json:"sort_order"`
		} `json:"ingredients"`
		TextIngredients []struct {
			Description string `json:"description"`
			SortOrder   int    `json:"sort_order"`
		} `json:"text_ingredients"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if input.Serves < 1 {
		input.Serves = 1
	}

	// Calculate totals from ingredients
	var totalCals, totalProtein, totalCarbs, totalFat, totalFibre, totalWeight float64
	for _, ing := range input.Ingredients {
		var cals, protein, carbs, fat, fibre float64
		err := database.DB.QueryRow(`
			SELECT calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fibre_per_100g
			FROM foods WHERE id = ?
		`, ing.FoodID).Scan(&cals, &protein, &carbs, &fat, &fibre)
		if err != nil {
			continue
		}
		multiplier := ing.QuantityGrams / 100
		totalCals += cals * multiplier
		totalProtein += protein * multiplier
		totalCarbs += carbs * multiplier
		totalFat += fat * multiplier
		totalFibre += fibre * multiplier
		totalWeight += ing.QuantityGrams
	}

	finalWeight := totalWeight
	if input.WeightIsManual && input.TotalWeightGrams > 0 {
		finalWeight = input.TotalWeightGrams
	}

	// Update recipe
	_, err = database.DB.Exec(`
		UPDATE recipes SET name = ?, description = ?, instructions = ?, serves = ?,
		       total_weight_grams = ?, weight_is_manual = ?, total_calories = ?,
		       total_protein = ?, total_carbs = ?, total_fat = ?, total_fibre = ?,
		       updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, input.Name, input.Description, input.Instructions, input.Serves,
		finalWeight, input.WeightIsManual, totalCals, totalProtein, totalCarbs, totalFat, totalFibre, id)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Replace ingredients
	database.DB.Exec(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, id)
	database.DB.Exec(`DELETE FROM recipe_text_ingredients WHERE recipe_id = ?`, id)

	for _, ing := range input.Ingredients {
		database.DB.Exec(`
			INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_grams, sort_order)
			VALUES (?, ?, ?, ?)
		`, id, ing.FoodID, ing.QuantityGrams, ing.SortOrder)
	}

	for _, ti := range input.TextIngredients {
		database.DB.Exec(`
			INSERT INTO recipe_text_ingredients (recipe_id, description, sort_order)
			VALUES (?, ?, ?)
		`, id, ti.Description, ti.SortOrder)
	}

	recipe, _ := getRecipeByID(id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipe)
}

// HandleDeleteRecipe deletes a recipe
func HandleDeleteRecipe(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`DELETE FROM recipes WHERE id = ?`, id)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
