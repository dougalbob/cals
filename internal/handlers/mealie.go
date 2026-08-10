package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"cals/internal/auth"
	"cals/internal/database"
	"cals/internal/mealie"
)

// MealieClient is set during startup if Mealie config is present.
var MealieClient *mealie.Client

// HandleMealieSearch proxies a recipe search to the configured Mealie instance.
func HandleMealieSearch(w http.ResponseWriter, r *http.Request) {
	if MealieClient == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "Mealie integration is not configured"})
		return
	}

	q := r.URL.Query().Get("q")
	if strings.TrimSpace(q) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "query parameter 'q' is required"})
		return
	}

	results, err := MealieClient.SearchRecipes(q)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Mealie search failed: %v", err)})
		return
	}

	if results == nil {
		results = []mealie.RecipeSummary{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// HandleMealieImport fetches a Mealie recipe by ID and creates it in cals.
func HandleMealieImport(w http.ResponseWriter, r *http.Request) {
	if MealieClient == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "Mealie integration is not configured"})
		return
	}

	id := r.PathValue("id")
	if strings.TrimSpace(id) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "recipe id is required"})
		return
	}

	email := auth.GetUserEmail(r.Context())
	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	detail, err := MealieClient.GetRecipe(id)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Mealie fetch failed: %v", err)})
		return
	}

	// Duplicate check — case-insensitive exact name match.
	var existingID int64
	err = database.DB.QueryRow(
		`SELECT id FROM recipes WHERE LOWER(name) = LOWER(?) LIMIT 1`, detail.Name,
	).Scan(&existingID)
	if err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]any{
			"error":       "A recipe with this name already exists",
			"existing_id": existingID,
		})
		return
	}
	if err != sql.ErrNoRows {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Build instructions string from steps.
	var sb strings.Builder
	for i, step := range detail.Instructions {
		if i > 0 {
			sb.WriteString("\n\n")
		}
		sb.WriteString(step.Text)
	}
	instructions := sb.String()

	// Parse serves — default to 1 when absent or unparseable.
	serves := 1
	if detail.RecipeYield != "" {
		var n int
		if _, err := fmt.Sscanf(detail.RecipeYield, "%d", &n); err == nil && n > 0 {
			serves = n
		}
	}

	result, err := database.DB.Exec(`
		INSERT INTO recipes (name, description, instructions, serves, created_by_user_id,
		                     calculated_weight_grams, total_weight_grams, weight_is_manual,
		                     total_calories, total_protein, total_carbs, total_fat, total_fibre)
		VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0)
	`, detail.Name, detail.Description, instructions, serves, user.ID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	recipeID, _ := result.LastInsertId()

	// Insert all ingredient lines as text ingredients preserving order.
	for i, ing := range detail.Ingredients {
		line := ingredientDisplayText(ing)
		if line == "" {
			continue
		}
		database.DB.Exec(
			`INSERT INTO recipe_text_ingredients (recipe_id, description, sort_order) VALUES (?, ?, ?)`,
			recipeID, line, i,
		)
	}

	recipe, _ := getRecipeByID(recipeID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(recipe)
}

// ingredientDisplayText returns the best human-readable string for a Mealie ingredient.
func ingredientDisplayText(ing mealie.RecipeIngredient) string {
	if ing.Display != "" {
		return ing.Display
	}
	if ing.Note != "" {
		return ing.Note
	}
	// Reconstruct from parts.
	var parts []string
	if ing.Quantity != nil {
		parts = append(parts, fmt.Sprintf("%v", ing.Quantity))
	}
	if ing.Unit != nil && ing.Unit.Name != "" {
		parts = append(parts, ing.Unit.Name)
	}
	if ing.Food != nil && ing.Food.Name != "" {
		parts = append(parts, ing.Food.Name)
	}
	return strings.Join(parts, " ")
}
