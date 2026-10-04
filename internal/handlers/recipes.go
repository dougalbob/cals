package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"cals/internal/auth"
	"cals/internal/database"
	"cals/internal/models"
)

var supportedRecipeMealOccasions = map[string]struct{}{
	"breakfast": {},
	"lunch":     {},
	"dinner":    {},
	"snack":     {},
}

var supportedRecipeDishTypes = map[string]struct{}{
	"main":    {},
	"side":    {},
	"soup":    {},
	"salad":   {},
	"dessert": {},
}

// writeJSONError answers with the documented `{"error": "..."}` shape.
func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// HandleListRecipes returns the shared recipe catalogue with the current user's favourite state.
//
// Archived recipes (decision 59) are left out unless the caller asks for them
// with `?include_archived=true`, so every picker and the legacy UI are safe by
// default; only the Recipes page that offers "Show archived" opts in.
func HandleListRecipes(w http.ResponseWriter, r *http.Request) {
	user, err := GetOrCreateUser(auth.GetUserEmail(r.Context()))
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	includeArchived := 0
	if r.URL.Query().Get("include_archived") == "true" {
		includeArchived = 1
	}

	rows, err := database.DB.Query(`
		SELECT r.id, r.name, r.description, r.image_filename, r.serves,
		       r.calculated_weight_grams, r.total_weight_grams, r.total_calories,
		       r.created_by_user_id, COALESCE(u.name, u.email) as created_by_name,
		       EXISTS (
		           SELECT 1 FROM recipe_favourites rf
		           WHERE rf.recipe_id = r.id AND rf.user_id = ?
		       ) AS is_favourite,
		       COALESCE(log_counts.times_logged, 0) AS times_logged,
		       r.updated_at, r.dish_type, r.total_time_minutes,
		       p.grams AS usual_grams, r.is_archived, r.is_own_creation
		FROM recipes r
		LEFT JOIN users u ON r.created_by_user_id = u.id
		LEFT JOIN recipe_user_portions p ON p.recipe_id = r.id AND p.user_id = ?
		LEFT JOIN (
		    SELECT de.recipe_id, COUNT(*) AS times_logged
		    FROM diary_entries de
		    WHERE de.user_id = ? AND de.recipe_id IS NOT NULL
		    GROUP BY de.recipe_id
		) log_counts ON log_counts.recipe_id = r.id
		WHERE (? = 1 OR r.is_archived = 0)
		ORDER BY r.name
	`, user.ID, user.ID, user.ID, includeArchived)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var recipes []models.Recipe
	for rows.Next() {
		var recipe models.Recipe
		var desc, img, dishType sql.NullString
		var calcWeight, usualGrams sql.NullFloat64
		var totalTime sql.NullInt64
		var isFavourite, isArchived, isOwnCreation int
		err := rows.Scan(&recipe.ID, &recipe.Name, &desc, &img, &recipe.Serves,
			&calcWeight, &recipe.TotalWeightGrams, &recipe.TotalCalories, &recipe.CreatedByUserID,
			&recipe.CreatedByName, &isFavourite, &recipe.TimesLogged, &recipe.UpdatedAt, &dishType,
			&totalTime, &usualGrams, &isArchived, &isOwnCreation)
		if err != nil {
			rows.Close()
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		recipe.IsFavourite = isFavourite != 0
		recipe.IsArchived = isArchived != 0
		recipe.IsOwnCreation = isOwnCreation != 0
		if usualGrams.Valid {
			grams := usualGrams.Float64
			recipe.UsualGrams = &grams
		}
		if dishType.Valid {
			recipe.DishType = dishType.String
		}
		if totalTime.Valid {
			minutes := int(totalTime.Int64)
			recipe.TotalTimeMinutes = &minutes
		}
		if desc.Valid {
			recipe.Description = desc.String
		}
		if img.Valid {
			recipe.ImageFilename = img.String
		}
		if calcWeight.Valid {
			recipe.CalculatedWeightGrams = calcWeight.Float64
		}

		// Calculate per-100g based on final cooked weight.
		if recipe.TotalWeightGrams > 0 {
			recipe.CaloriesPer100g = (recipe.TotalCalories / recipe.TotalWeightGrams) * 100
		}

		recipes = append(recipes, recipe)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := rows.Close(); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if recipes == nil {
		recipes = []models.Recipe{}
	}
	recipePointers := make([]*models.Recipe, len(recipes))
	for i := range recipes {
		recipePointers[i] = &recipes[i]
	}
	if err := loadRecipeMetadata(recipePointers); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipes)
}

func loadRecipeMetadata(recipes []*models.Recipe) error {
	if len(recipes) == 0 {
		return nil
	}

	const batchSize = 500
	recipesByID := make(map[int64]*models.Recipe, len(recipes))
	for _, recipe := range recipes {
		recipe.MealOccasions = []string{}
		recipe.KeyFoods = []models.RecipeKeyFood{}
		recipesByID[recipe.ID] = recipe
	}

	for start := 0; start < len(recipes); start += batchSize {
		end := start + batchSize
		if end > len(recipes) {
			end = len(recipes)
		}
		batch := recipes[start:end]
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(batch)), ",")
		args := make([]interface{}, len(batch))
		for i, recipe := range batch {
			args[i] = recipe.ID
		}

		rows, err := database.DB.Query(`
			SELECT recipe_id, occasion FROM recipe_meal_occasions
			WHERE recipe_id IN (`+placeholders+`)
			ORDER BY recipe_id,
			         CASE occasion WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1
			                       WHEN 'dinner' THEN 2 ELSE 3 END
		`, args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var recipeID int64
			var occasion string
			if err := rows.Scan(&recipeID, &occasion); err != nil {
				rows.Close()
				return err
			}
			if recipe := recipesByID[recipeID]; recipe != nil {
				recipe.MealOccasions = append(recipe.MealOccasions, occasion)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		if err := rows.Close(); err != nil {
			return err
		}

		rows, err = database.DB.Query(`
			SELECT recipe_id, food_id, name FROM recipe_key_foods
			JOIN foods ON foods.id = recipe_key_foods.food_id
			WHERE recipe_id IN (`+placeholders+`)
			ORDER BY recipe_id, sort_order, food_id
		`, args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var recipeID int64
			var keyFood models.RecipeKeyFood
			if err := rows.Scan(&recipeID, &keyFood.FoodID, &keyFood.FoodName); err != nil {
				rows.Close()
				return err
			}
			if recipe := recipesByID[recipeID]; recipe != nil {
				recipe.KeyFoods = append(recipe.KeyFoods, keyFood)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		if err := rows.Close(); err != nil {
			return err
		}
	}

	return nil
}

// HandleGetRecipe returns a single recipe with all details
func HandleGetRecipe(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	user, err := GetOrCreateUser(auth.GetUserEmail(r.Context()))
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	recipe, err := getRecipeForUser(id, user.ID)
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

func getRecipeForUser(id, userID int64) (*models.Recipe, error) {
	recipe, err := getRecipeByID(id)
	if err != nil {
		return nil, err
	}
	var isFavourite int
	if err := database.DB.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM recipe_favourites WHERE user_id = ? AND recipe_id = ?
		)
	`, userID, id).Scan(&isFavourite); err != nil {
		return nil, err
	}
	recipe.IsFavourite = isFavourite != 0

	if err := database.DB.QueryRow(`
		SELECT COUNT(*) FROM diary_entries WHERE recipe_id = ? AND user_id = ?
	`, id, userID).Scan(&recipe.TimesLogged); err != nil {
		return nil, err
	}

	usualGrams, err := loadUsualRecipePortion(userID, id)
	if err != nil {
		return nil, err
	}
	recipe.UsualGrams = usualGrams

	return recipe, nil
}

// loadUsualRecipePortion returns one user's remembered grams for a recipe, or
// nil when they have never logged it.
func loadUsualRecipePortion(userID, recipeID int64) (*float64, error) {
	var grams float64
	err := database.DB.QueryRow(`
		SELECT grams FROM recipe_user_portions WHERE user_id = ? AND recipe_id = ?
	`, userID, recipeID).Scan(&grams)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &grams, nil
}

// rememberRecipePortion records a user's usual grams for a recipe.
//
// Decision 32: the first successful log becomes their usual, and later logs do
// not change it unless the client explicitly asks (`make_usual`). A one-off
// larger or smaller portion therefore never quietly rewrites the usual.
func rememberRecipePortion(userID, recipeID int64, grams float64, makeUsual bool) error {
	if !(grams > 0) {
		return nil
	}

	if makeUsual {
		_, err := database.DB.Exec(`
			INSERT INTO recipe_user_portions (user_id, recipe_id, grams, updated_at)
			VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(user_id, recipe_id)
			DO UPDATE SET grams = excluded.grams, updated_at = CURRENT_TIMESTAMP
		`, userID, recipeID, grams)
		return err
	}

	_, err := database.DB.Exec(`
		INSERT INTO recipe_user_portions (user_id, recipe_id, grams)
		VALUES (?, ?, ?)
		ON CONFLICT(user_id, recipe_id) DO NOTHING
	`, userID, recipeID, grams)
	return err
}

func getRecipeByID(id int64) (*models.Recipe, error) {
	var r models.Recipe
	var desc, instructions, img, dishType sql.NullString
	var calcWeight sql.NullFloat64
	var totalTime sql.NullInt64
	var isArchived, isOwnCreation int

	err := database.DB.QueryRow(`
		SELECT r.id, r.name, r.description, r.instructions, r.image_filename, r.serves,
		       r.created_by_user_id, r.calculated_weight_grams, r.total_weight_grams, r.weight_is_manual,
		       r.total_calories, r.total_protein, r.total_carbs, r.total_fat, r.total_fibre,
		       r.created_at, r.updated_at, r.dish_type, r.total_time_minutes,
		       COALESCE(u.name, u.email) as created_by_name, r.is_archived, r.is_own_creation
		FROM recipes r
		LEFT JOIN users u ON r.created_by_user_id = u.id
		WHERE r.id = ?
	`, id).Scan(&r.ID, &r.Name, &desc, &instructions, &img, &r.Serves,
		&r.CreatedByUserID, &calcWeight, &r.TotalWeightGrams, &r.WeightIsManual,
		&r.TotalCalories, &r.TotalProtein, &r.TotalCarbs, &r.TotalFat, &r.TotalFibre,
		&r.CreatedAt, &r.UpdatedAt, &dishType, &totalTime, &r.CreatedByName, &isArchived, &isOwnCreation)
	if err != nil {
		return nil, err
	}
	r.IsArchived = isArchived != 0
	r.IsOwnCreation = isOwnCreation != 0

	if desc.Valid {
		r.Description = desc.String
	}
	if dishType.Valid {
		r.DishType = dishType.String
	}
	if totalTime.Valid {
		minutes := int(totalTime.Int64)
		r.TotalTimeMinutes = &minutes
	}
	if instructions.Valid {
		r.Instructions = instructions.String
	}
	if img.Valid {
		r.ImageFilename = img.String
	}
	if calcWeight.Valid {
		r.CalculatedWeightGrams = calcWeight.Float64
	}

	// Calculate per-100g values based on final cooked weight
	if r.TotalWeightGrams > 0 {
		r.CaloriesPer100g = (r.TotalCalories / r.TotalWeightGrams) * 100
		r.ProteinPer100g = (r.TotalProtein / r.TotalWeightGrams) * 100
		r.CarbsPer100g = (r.TotalCarbs / r.TotalWeightGrams) * 100
		r.FatPer100g = (r.TotalFat / r.TotalWeightGrams) * 100
		r.FibrePer100g = (r.TotalFibre / r.TotalWeightGrams) * 100
	}

	r.Ingredients = []models.RecipeIngredient{}
	r.TextIngredients = []models.RecipeTextIngredient{}

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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
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
	if err := textRows.Err(); err != nil {
		return nil, err
	}
	if err := textRows.Close(); err != nil {
		return nil, err
	}
	if err := loadRecipeMetadata([]*models.Recipe{&r}); err != nil {
		return nil, err
	}

	return &r, nil
}

// HandleCreateRecipe creates a new shared recipe with its initial classification.
// Recipe content and shared metadata are committed together so a failed metadata
// write cannot leave behind a half-authored recipe.
func HandleCreateRecipe(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name             string   `json:"name"`
		Description      string   `json:"description"`
		Instructions     string   `json:"instructions"`
		Serves           int      `json:"serves"`
		IsOwnCreation    bool     `json:"is_own_creation"`
		DishType         string   `json:"dish_type"`
		MealOccasions    []string `json:"meal_occasions"`
		KeyFoodIDs       []int64  `json:"key_food_ids"`
		TotalTimeMinutes *int     `json:"total_time_minutes"`
		TotalWeightGrams float64  `json:"total_weight_grams"`
		WeightIsManual   bool     `json:"weight_is_manual"`
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
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "Name is required")
		return
	}
	if input.Serves < 1 {
		input.Serves = 1
	}

	metadata := recipeMetadataInput{
		MealOccasions:    input.MealOccasions,
		DishType:         input.DishType,
		KeyFoodIDs:       input.KeyFoodIDs,
		TotalTimeMinutes: input.TotalTimeMinutes,
	}
	if message := validateRecipeMetadata(metadata); message != "" {
		writeJSONError(w, http.StatusBadRequest, message)
		return
	}
	if input.WeightIsManual && input.TotalWeightGrams <= 0 {
		writeJSONError(w, http.StatusBadRequest, "A manually measured cooked weight must be greater than zero")
		return
	}

	usedFoodIDs := make(map[int64]struct{}, len(input.Ingredients))
	for _, ingredient := range input.Ingredients {
		if ingredient.FoodID <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Food ingredient IDs must be positive")
			return
		}
		if ingredient.QuantityGrams <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Every food ingredient must have a weight greater than zero grams")
			return
		}
		usedFoodIDs[ingredient.FoodID] = struct{}{}
	}
	for _, foodID := range input.KeyFoodIDs {
		if _, ok := usedFoodIDs[foodID]; !ok {
			writeJSONError(w, http.StatusBadRequest, "Key foods must be known foods already used in this recipe")
			return
		}
	}

	user, err := GetOrCreateUser(auth.GetUserEmail(r.Context()))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
		return
	}

	tx, err := database.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
		return
	}
	defer tx.Rollback()

	// Resolve every ingredient before inserting anything; an unknown Food must
	// never result in a recipe whose saved totals disagree with its ingredients.
	var totalCals, totalProtein, totalCarbs, totalFat, totalFibre, calculatedWeight float64
	for _, ingredient := range input.Ingredients {
		var cals, protein, carbs, fat, fibre float64
		err := tx.QueryRowContext(r.Context(), `
			SELECT calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fibre_per_100g
			FROM foods WHERE id = ?
		`, ingredient.FoodID).Scan(&cals, &protein, &carbs, &fat, &fibre)
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusBadRequest, "Food "+strconv.FormatInt(ingredient.FoodID, 10)+" was not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
			return
		}
		multiplier := ingredient.QuantityGrams / 100
		totalCals += cals * multiplier
		totalProtein += protein * multiplier
		totalCarbs += carbs * multiplier
		totalFat += fat * multiplier
		totalFibre += fibre * multiplier
		calculatedWeight += ingredient.QuantityGrams
	}

	finalWeight := calculatedWeight
	if input.WeightIsManual {
		finalWeight = input.TotalWeightGrams
	}

	var dishType interface{}
	if input.DishType != "" {
		dishType = input.DishType
	}
	var totalTime interface{}
	if input.TotalTimeMinutes != nil {
		totalTime = *input.TotalTimeMinutes
	}
	result, err := tx.ExecContext(r.Context(), `
		INSERT INTO recipes (name, description, instructions, serves, created_by_user_id,
		                     is_own_creation, dish_type, total_time_minutes,
		                     calculated_weight_grams, total_weight_grams, weight_is_manual,
		                     total_calories, total_protein, total_carbs, total_fat, total_fibre)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, input.Name, input.Description, input.Instructions, input.Serves, user.ID, input.IsOwnCreation,
		dishType, totalTime, calculatedWeight, finalWeight, input.WeightIsManual,
		totalCals, totalProtein, totalCarbs, totalFat, totalFibre)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
		return
	}

	recipeID, err := result.LastInsertId()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
		return
	}

	for _, ingredient := range input.Ingredients {
		if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_grams, sort_order)
			VALUES (?, ?, ?, ?)
		`, recipeID, ingredient.FoodID, ingredient.QuantityGrams, ingredient.SortOrder); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
			return
		}
	}
	for _, ingredient := range input.TextIngredients {
		if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO recipe_text_ingredients (recipe_id, description, sort_order)
			VALUES (?, ?, ?)
		`, recipeID, ingredient.Description, ingredient.SortOrder); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
			return
		}
	}
	for _, occasion := range input.MealOccasions {
		if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO recipe_meal_occasions (recipe_id, occasion) VALUES (?, ?)
		`, recipeID, occasion); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
			return
		}
	}
	for order, foodID := range input.KeyFoodIDs {
		if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO recipe_key_foods (recipe_id, food_id, sort_order) VALUES (?, ?, ?)
		`, recipeID, foodID, order); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
		return
	}

	recipe, err := getRecipeForUser(recipeID, user.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(recipe)
}

// HandleUpdateRecipe updates an existing recipe's content. Recipe names are
// fixed at creation (decision 58), and Diary nutrition snapshots are never
// recalculated by a definition edit (decision 55).
func HandleUpdateRecipe(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	user, err := GetOrCreateUser(auth.GetUserEmail(r.Context()))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}

	var input struct {
		Name             *string                     `json:"name"`
		Description      string                      `json:"description"`
		Instructions     string                      `json:"instructions"`
		Serves           int                         `json:"serves"`
		TotalWeightGrams float64                     `json:"total_weight_grams"`
		WeightIsManual   bool                        `json:"weight_is_manual"`
		Ingredients      []recipeIngredientInput     `json:"ingredients"`
		TextIngredients  []recipeTextIngredientInput `json:"text_ingredients"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}

	if input.Serves < 1 {
		input.Serves = 1
	}
	if input.WeightIsManual && !isFinitePositive(input.TotalWeightGrams) {
		writeJSONError(w, http.StatusBadRequest, "A manually measured cooked weight must be greater than zero")
		return
	}
	for _, ingredient := range input.Ingredients {
		if ingredient.FoodID <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Every food ingredient must reference a known food")
			return
		}
		if !isFinitePositive(ingredient.QuantityGrams) {
			writeJSONError(w, http.StatusBadRequest, "Every food ingredient must have a weight greater than zero grams")
			return
		}
	}
	for i := range input.TextIngredients {
		input.TextIngredients[i].Description = strings.TrimSpace(input.TextIngredients[i].Description)
		if input.TextIngredients[i].Description == "" {
			writeJSONError(w, http.StatusBadRequest, "Every text ingredient needs a description")
			return
		}
	}

	tx, err := database.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer tx.Rollback()

	var existingName string
	if err := tx.QueryRow(`SELECT name FROM recipes WHERE id = ?`, id).Scan(&existingName); err != nil {
		if err == sql.ErrNoRows {
			writeJSONError(w, http.StatusNotFound, "Recipe not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}
	if input.Name != nil && *input.Name != existingName {
		writeJSONError(w, http.StatusBadRequest, "Recipe names cannot be changed after creation")
		return
	}

	nutrition, err := calculateRecipeNutrition(tx, input.Ingredients)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}

	finalWeight := nutrition.CalculatedWeightGrams
	if input.WeightIsManual {
		finalWeight = input.TotalWeightGrams
	}
	if _, err := tx.Exec(`
		UPDATE recipes SET description = ?, instructions = ?, serves = ?,
		       calculated_weight_grams = ?, total_weight_grams = ?, weight_is_manual = ?,
		       total_calories = ?, total_protein = ?, total_carbs = ?, total_fat = ?, total_fibre = ?,
		       updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, input.Description, input.Instructions, input.Serves,
		nutrition.CalculatedWeightGrams, finalWeight, input.WeightIsManual,
		nutrition.Calories, nutrition.Protein, nutrition.Carbs, nutrition.Fat, nutrition.Fibre, id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}

	if _, err := tx.Exec(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}
	if _, err := tx.Exec(`DELETE FROM recipe_text_ingredients WHERE recipe_id = ?`, id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}
	for _, ingredient := range input.Ingredients {
		if _, err := tx.Exec(`
			INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_grams, sort_order)
			VALUES (?, ?, ?, ?)
		`, id, ingredient.FoodID, ingredient.QuantityGrams, ingredient.SortOrder); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Database error")
			return
		}
	}
	for _, ingredient := range input.TextIngredients {
		if _, err := tx.Exec(`
			INSERT INTO recipe_text_ingredients (recipe_id, description, sort_order)
			VALUES (?, ?, ?)
		`, id, ingredient.Description, ingredient.SortOrder); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Database error")
			return
		}
	}
	if _, err := tx.Exec(`
		DELETE FROM recipe_key_foods
		WHERE recipe_id = ? AND food_id NOT IN (
			SELECT food_id FROM recipe_ingredients WHERE recipe_id = ?
		)
	`, id, id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}

	recipe, err := getRecipeForUser(id, user.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Database error")
		return
	}
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

	// Decision 59: a recipe that Diary history points at is never deleted.
	// The foreign key would refuse anyway (with an opaque 500); answer with a
	// clear conflict that tells the client what to do instead.
	var diaryRefs int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM diary_entries WHERE recipe_id = ?`, id).Scan(&diaryRefs); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if diaryRefs > 0 {
		writeJSONError(w, http.StatusConflict,
			"This recipe appears in the Diary, so it can't be deleted. Archive it instead to hide it from the recipe list.")
		return
	}

	_, err = database.DB.Exec(`DELETE FROM recipes WHERE id = ?`, id)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleSetRecipeArchived archives or restores a shared recipe (decision 59).
//
// Archiving only flips the flag: the recipe row, its ingredients and every
// Diary reference stay exactly as they were, so recorded history (and the names
// and links shown against it) cannot change. It is household-wide because
// recipes are shared; favourites and usual portions are personal and untouched.
// The call is idempotent — repeating it keeps the original archived_at.
func HandleSetRecipeArchived(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	var input struct {
		IsArchived *bool `json:"is_archived"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if input.IsArchived == nil {
		http.Error(w, "is_archived is required", http.StatusBadRequest)
		return
	}

	user, err := GetOrCreateUser(auth.GetUserEmail(r.Context()))
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var recipeID int64
	if err := database.DB.QueryRow(`SELECT id FROM recipes WHERE id = ?`, id).Scan(&recipeID); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Recipe not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// updated_at is deliberately left alone: archiving is not a content edit,
	// and the card image URL is cache-busted by it.
	if *input.IsArchived {
		_, err = database.DB.Exec(`
			UPDATE recipes
			SET is_archived = 1, archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
			WHERE id = ?
		`, recipeID)
	} else {
		_, err = database.DB.Exec(`
			UPDATE recipes SET is_archived = 0, archived_at = NULL WHERE id = ?
		`, recipeID)
	}
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	recipe, err := getRecipeForUser(recipeID, user.ID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipe)
}

// HandleSetRecipeFavourite sets or clears the signed-in user's favourite for a shared recipe.
func HandleSetRecipeFavourite(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	var input struct {
		IsFavourite *bool `json:"is_favourite"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if input.IsFavourite == nil {
		http.Error(w, "is_favourite is required", http.StatusBadRequest)
		return
	}

	user, err := GetOrCreateUser(auth.GetUserEmail(r.Context()))
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var recipeID int64
	if err := database.DB.QueryRow(`SELECT id FROM recipes WHERE id = ?`, id).Scan(&recipeID); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Recipe not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if *input.IsFavourite {
		_, err = database.DB.Exec(`
			INSERT OR IGNORE INTO recipe_favourites (user_id, recipe_id) VALUES (?, ?)
		`, user.ID, recipeID)
	} else {
		_, err = database.DB.Exec(`
			DELETE FROM recipe_favourites WHERE user_id = ? AND recipe_id = ?
		`, user.ID, recipeID)
	}
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"is_favourite": *input.IsFavourite})
}

type recipeMetadataInput struct {
	MealOccasions    []string `json:"meal_occasions"`
	DishType         string   `json:"dish_type"`
	KeyFoodIDs       []int64  `json:"key_food_ids"`
	IsOwnCreation    *bool    `json:"is_own_creation"`
	TotalTimeMinutes *int     `json:"total_time_minutes"`
}

// HandleUpdateRecipeMetadata replaces the shared, structured metadata for one recipe.
func HandleUpdateRecipeMetadata(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	var input recipeMetadataInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if message := validateRecipeMetadata(input); message != "" {
		http.Error(w, message, http.StatusBadRequest)
		return
	}

	user, err := GetOrCreateUser(auth.GetUserEmail(r.Context()))
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	tx, err := database.DB.BeginTx(r.Context(), nil)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var recipeID int64
	if err := tx.QueryRow(`SELECT id FROM recipes WHERE id = ?`, id).Scan(&recipeID); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Recipe not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if len(input.KeyFoodIDs) > 0 {
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(input.KeyFoodIDs)), ",")
		args := make([]interface{}, 0, len(input.KeyFoodIDs)+1)
		args = append(args, recipeID)
		for _, foodID := range input.KeyFoodIDs {
			args = append(args, foodID)
		}
		var matchingIngredients int
		query := `SELECT COUNT(DISTINCT food_id) FROM recipe_ingredients
		          WHERE recipe_id = ? AND food_id IN (` + placeholders + `)`
		if err := tx.QueryRow(query, args...).Scan(&matchingIngredients); err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if matchingIngredients != len(input.KeyFoodIDs) {
			http.Error(w, "Key foods must be known foods already used in this recipe", http.StatusBadRequest)
			return
		}
	}

	var dishType interface{}
	if input.DishType != "" {
		dishType = input.DishType
	}
	var totalTime interface{}
	if input.TotalTimeMinutes != nil {
		totalTime = *input.TotalTimeMinutes
	}
	var ownCreation interface{}
	if input.IsOwnCreation != nil {
		ownCreation = *input.IsOwnCreation
	}
	if _, err := tx.Exec(`
		UPDATE recipes
		SET dish_type = ?, total_time_minutes = ?,
		    is_own_creation = COALESCE(?, is_own_creation), updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, dishType, totalTime, ownCreation, recipeID); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(`DELETE FROM recipe_meal_occasions WHERE recipe_id = ?`, recipeID); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	for _, occasion := range input.MealOccasions {
		if _, err := tx.Exec(`INSERT INTO recipe_meal_occasions (recipe_id, occasion) VALUES (?, ?)`, recipeID, occasion); err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if _, err := tx.Exec(`DELETE FROM recipe_key_foods WHERE recipe_id = ?`, recipeID); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	for order, foodID := range input.KeyFoodIDs {
		if _, err := tx.Exec(`
			INSERT INTO recipe_key_foods (recipe_id, food_id, sort_order) VALUES (?, ?, ?)
		`, recipeID, foodID, order); err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	recipe, err := getRecipeForUser(recipeID, user.ID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipe)
}

func validateRecipeMetadata(input recipeMetadataInput) string {
	seenOccasions := make(map[string]struct{}, len(input.MealOccasions))
	for _, occasion := range input.MealOccasions {
		if _, ok := supportedRecipeMealOccasions[occasion]; !ok {
			return "Unsupported meal occasion: " + occasion
		}
		if _, duplicate := seenOccasions[occasion]; duplicate {
			return "Meal occasions must not contain duplicates"
		}
		seenOccasions[occasion] = struct{}{}
	}
	if input.DishType != "" {
		if _, ok := supportedRecipeDishTypes[input.DishType]; !ok {
			return "Unsupported dish type: " + input.DishType
		}
	}
	if len(input.KeyFoodIDs) > 2 {
		return "A recipe can have at most two key foods"
	}
	seenFoods := make(map[int64]struct{}, len(input.KeyFoodIDs))
	for _, foodID := range input.KeyFoodIDs {
		if foodID <= 0 {
			return "Key food IDs must be positive"
		}
		if _, duplicate := seenFoods[foodID]; duplicate {
			return "Key food IDs must not contain duplicates"
		}
		seenFoods[foodID] = struct{}{}
	}
	if input.TotalTimeMinutes != nil && *input.TotalTimeMinutes <= 0 {
		return "Total time must be a positive number of minutes"
	}
	return ""
}
