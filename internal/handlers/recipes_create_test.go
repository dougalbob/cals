package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"cals/internal/database"
	"cals/internal/models"
)

func postRecipeForTest(t *testing.T, email string, body any) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encoding recipe input: %v", err)
	}
	recorder := httptest.NewRecorder()
	HandleCreateRecipe(recorder, authedRequest(t, http.MethodPost, "/api/recipes", string(encoded), email))
	return recorder
}

func TestCreateRecipePersistsContentAndSharedClassification(t *testing.T) {
	setupHandlerDB(t)
	creatorID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	chickenID := createNutritionFoodForTest(t, "Chicken breast", 200, 30, 0, 8, 0)
	riceID := createNutritionFoodForTest(t, "Basmati rice", 130, 3, 28, 0.3, 0.4)

	input := recipeInput("  Chicken and rice bowl  ", chickenID, 250, 200, true)
	input["meal_occasions"] = []string{"lunch", "dinner"}
	input["dish_type"] = "main"
	input["key_food_ids"] = []int64{chickenID, riceID}
	input["is_own_creation"] = true
	input["total_time_minutes"] = 45
	input["ingredients"] = []map[string]any{
		{"food_id": chickenID, "quantity_grams": 250.0, "sort_order": 0},
		{"food_id": riceID, "quantity_grams": 150.0, "sort_order": 1},
	}

	recorder := postRecipeForTest(t, "wife@example.com", input)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("POST /api/recipes status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var created models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&created); err != nil {
		t.Fatalf("decoding created recipe: %v", err)
	}

	if created.Name != "Chicken and rice bowl" {
		t.Errorf("name = %q, want trimmed recipe name", created.Name)
	}
	if created.CreatedByUserID != creatorID {
		t.Errorf("created_by_user_id = %d, want %d", created.CreatedByUserID, creatorID)
	}
	if !created.IsOwnCreation || created.DishType != "main" || created.TotalTimeMinutes == nil || *created.TotalTimeMinutes != 45 {
		t.Errorf("created classification = %+v", created)
	}
	if len(created.MealOccasions) != 2 || created.MealOccasions[0] != "lunch" || created.MealOccasions[1] != "dinner" {
		t.Errorf("meal occasions = %v, want [lunch dinner]", created.MealOccasions)
	}
	if len(created.KeyFoods) != 2 || created.KeyFoods[0].FoodID != chickenID || created.KeyFoods[1].FoodID != riceID {
		t.Errorf("key foods = %+v, want chicken and rice", created.KeyFoods)
	}
	if len(created.Ingredients) != 2 || len(created.TextIngredients) != 1 {
		t.Errorf("created ingredients = %d foods, %d text; want 2 and 1", len(created.Ingredients), len(created.TextIngredients))
	}
	if created.CalculatedWeightGrams != 400 || created.TotalWeightGrams != 200 || !created.WeightIsManual {
		t.Errorf("created weight = calculated %v, total %v, manual %v", created.CalculatedWeightGrams, created.TotalWeightGrams, created.WeightIsManual)
	}
	if created.TotalCalories != 695 || created.CaloriesPer100g != 347.5 {
		t.Errorf("created calories = total %v, per 100 g %v; want 695 and 347.5", created.TotalCalories, created.CaloriesPer100g)
	}

	// Recipe classification is shared; the creator ID and personal preferences
	// remain separate from the shared Own creation marker.
	for _, email := range []string{"wife@example.com", "husband@example.com"} {
		listed := findRecipe(t, listRecipesForTest(t, email), created.ID)
		if !listed.IsOwnCreation || listed.DishType != "main" || len(listed.MealOccasions) != 2 || len(listed.KeyFoods) != 2 {
			t.Errorf("shared metadata for %s = %+v", email, listed)
		}
		if listed.IsFavourite || listed.UsualGrams != nil {
			t.Errorf("new recipe should not set personal preferences for %s: favourite=%v usual=%v", email, listed.IsFavourite, listed.UsualGrams)
		}
	}
}

func TestCreateRecipeRejectsInvalidClassificationWithoutWriting(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	foodID := createNutritionFoodForTest(t, "Lentils", 100, 8, 18, 1, 7)
	otherFoodID := createNutritionFoodForTest(t, "Carrots", 41, 0.9, 9.6, 0.2, 2.8)

	input := recipeInput("Lentil stew", foodID, 100, 0, false)
	input["key_food_ids"] = []int64{otherFoodID}
	input["meal_occasions"] = []string{"dinner", "dinner"}

	recorder := postRecipeForTest(t, "wife@example.com", input)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("invalid metadata status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var count int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM recipes`).Scan(&count); err != nil {
		t.Fatalf("counting recipes: %v", err)
	}
	if count != 0 {
		t.Errorf("invalid recipe request wrote %d recipes, want none", count)
	}
}

func TestCreateRecipeRollsBackContentWhenMetadataWriteFails(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	foodID := createNutritionFoodForTest(t, "Lentils", 100, 8, 18, 1, 7)
	if _, err := database.DB.Exec(`
		CREATE TRIGGER fail_recipe_key_food_insert
		BEFORE INSERT ON recipe_key_foods
		BEGIN
			SELECT RAISE(ABORT, 'forced metadata failure');
		END;
	`); err != nil {
		t.Fatalf("creating metadata failure trigger: %v", err)
	}

	input := recipeInput("Lentil stew", foodID, 100, 0, false)
	input["key_food_ids"] = []int64{foodID}
	input["meal_occasions"] = []string{"dinner"}
	recorder := postRecipeForTest(t, "wife@example.com", input)
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("metadata failure status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	for _, table := range []string{"recipes", "recipe_ingredients", "recipe_text_ingredients", "recipe_meal_occasions", "recipe_key_foods"} {
		var count int
		if err := database.DB.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil {
			t.Fatalf("counting %s: %v", table, err)
		}
		if count != 0 {
			t.Errorf("failed create left %d rows in %s; want transaction rollback", count, table)
		}
	}
}
