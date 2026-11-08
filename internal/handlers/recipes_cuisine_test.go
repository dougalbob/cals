package handlers

// Recipe cuisine — issue #90, decision 123.
//
// Cuisine is an additive, free-text tag on the shared recipe definition, so
// these tests pin the three things that could quietly break: it is stored
// trimmed, it survives a content edit (which must not touch classification),
// and an over-long value is rejected without changing what is already saved.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cals/internal/database"
	"cals/internal/models"
)

func listRecipeCuisinesForTest(t *testing.T, email string) []string {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleListRecipeCuisines(recorder, authedRequest(t, http.MethodGet, "/api/recipes/cuisines", "", email))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/recipes/cuisines status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var cuisines []string
	if err := json.NewDecoder(recorder.Body).Decode(&cuisines); err != nil {
		t.Fatalf("decoding cuisine list: %v", err)
	}
	return cuisines
}

func getRecipeDetailRecipeForTest(t *testing.T, recipeID int64, email string) models.Recipe {
	t.Helper()
	recorder := getRecipeDetailForTest(t, recipeID, email)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/recipes/%d status = %d, body = %s", recipeID, recorder.Code, recorder.Body.String())
	}
	var recipe models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&recipe); err != nil {
		t.Fatalf("decoding recipe detail: %v", err)
	}
	return recipe
}

func createRecipeWithCuisineForTest(t *testing.T, email, name, cuisine string) models.Recipe {
	t.Helper()
	foodID := createNutritionFoodForTest(t, name+" base", 150, 10, 20, 5, 2)
	input := recipeInput(name, foodID, 100, 0, false)
	input["cuisine"] = cuisine
	return createRecipeThroughAPIForTest(t, email, input)
}

func TestCreateRecipeStoresTrimmedCuisine(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	created := createRecipeWithCuisineForTest(t, "wife@example.com", "Pad thai", "  Thai  ")
	if created.Cuisine != "Thai" {
		t.Errorf("created cuisine = %q, want trimmed %q", created.Cuisine, "Thai")
	}

	if listed := findRecipe(t, listRecipesForTest(t, "wife@example.com"), created.ID); listed.Cuisine != "Thai" {
		t.Errorf("listed cuisine = %q, want %q", listed.Cuisine, "Thai")
	}
	if detail := getRecipeDetailRecipeForTest(t, created.ID, "wife@example.com"); detail.Cuisine != "Thai" {
		t.Errorf("detail cuisine = %q, want %q", detail.Cuisine, "Thai")
	}

	// A recipe created without a cuisine stays empty rather than showing "null".
	plain := createRecipeWithCuisineForTest(t, "wife@example.com", "Apple loaf", "")
	if plain.Cuisine != "" {
		t.Errorf("cuisine = %q, want empty when none is given", plain.Cuisine)
	}
	if listed := findRecipe(t, listRecipesForTest(t, "wife@example.com"), plain.ID); listed.Cuisine != "" {
		t.Errorf("listed cuisine = %q, want empty", listed.Cuisine)
	}
}

func TestRecipeCuisineIsEditedThroughMetadataAndSurvivesContentEdits(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipe := createRecipeWithCuisineForTest(t, "wife@example.com", "Chicken curry", "Indian")
	foodID := createNutritionFoodForTest(t, "Extra rice", 130, 3, 28, 0.3, 0.4)

	// A content edit (ingredients, method, weight) must not disturb the tag.
	updated := updateRecipeForTest(t, recipe.ID, "wife@example.com", map[string]any{
		"name":               recipe.Name,
		"description":        "Week-night curry",
		"instructions":       "Simmer and serve.",
		"serves":             4,
		"total_weight_grams": 0,
		"weight_is_manual":   false,
		"ingredients": []map[string]any{
			{"food_id": foodID, "quantity_grams": 200.0, "sort_order": 0},
		},
		"text_ingredients": []map[string]any{{"description": "Salt", "sort_order": 0}},
	})
	if updated.Code != http.StatusOK {
		t.Fatalf("PUT /api/recipes/%d status = %d, body = %s", recipe.ID, updated.Code, updated.Body.String())
	}
	if listed := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipe.ID); listed.Cuisine != "Indian" {
		t.Errorf("cuisine after a content edit = %q, want %q", listed.Cuisine, "Indian")
	}

	// Metadata is the one place cuisine is written from the recipe card.
	recorder := updateRecipeMetadataForTest(t, recipe.ID, "wife@example.com",
		`{"meal_occasions":["dinner"],"dish_type":"main","key_food_ids":[],"total_time_minutes":null,"cuisine":" Thai "}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT metadata status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if listed := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipe.ID); listed.Cuisine != "Thai" {
		t.Errorf("cuisine after metadata write = %q, want %q", listed.Cuisine, "Thai")
	}

	// Empty clears it again; the column is nullable, so no recipe is stuck
	// carrying a cuisine it no longer has.
	recorder = updateRecipeMetadataForTest(t, recipe.ID, "wife@example.com",
		`{"meal_occasions":[],"dish_type":"","key_food_ids":[],"total_time_minutes":null,"cuisine":"   "}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("clearing cuisine status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if listed := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipe.ID); listed.Cuisine != "" {
		t.Errorf("cuisine after clearing = %q, want empty", listed.Cuisine)
	}
}

func TestRecipeCuisineRejectsAnOverLongValueWithoutChangingTheRecipe(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipe := createRecipeWithCuisineForTest(t, "wife@example.com", "Enchiladas", "Mexican")

	tooLong := strings.Repeat("x", maxRecipeCuisineLength+1)
	recorder := updateRecipeMetadataForTest(t, recipe.ID, "wife@example.com",
		`{"meal_occasions":[],"dish_type":"","key_food_ids":[],"total_time_minutes":null,"cuisine":"`+tooLong+`"}`)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("over-long cuisine status = %d, want 400, body = %s", recorder.Code, recorder.Body.String())
	}
	if listed := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipe.ID); listed.Cuisine != "Mexican" {
		t.Errorf("cuisine after a rejected write = %q, want the saved %q", listed.Cuisine, "Mexican")
	}

	// The same limit applies at creation: nothing is written at all.
	foodID := createNutritionFoodForTest(t, "Tortilla", 300, 8, 50, 8, 4)
	input := recipeInput("Over-long", foodID, 100, 0, false)
	input["cuisine"] = tooLong
	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatalf("encoding recipe input: %v", err)
	}
	createRecorder := httptest.NewRecorder()
	HandleCreateRecipe(createRecorder, authedRequest(t, http.MethodPost, "/api/recipes", string(encoded), "wife@example.com"))
	if createRecorder.Code != http.StatusBadRequest {
		t.Fatalf("POST with over-long cuisine status = %d, want 400, body = %s", createRecorder.Code, createRecorder.Body.String())
	}
	var count int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM recipes WHERE name = 'Over-long'`).Scan(&count); err != nil {
		t.Fatalf("counting recipes: %v", err)
	}
	if count != 0 {
		t.Errorf("recipes named Over-long = %d, want 0 (a rejected write must not create one)", count)
	}
}

func TestRecipeCuisineSurvivesMetadataWrittenByAnOlderClient(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipe := createRecipeWithCuisineForTest(t, "wife@example.com", "Chicken curry", "Indian")

	// A cached bundle that predates cuisines sends no `cuisine` key at all.
	// Clearing the household's tagging as a side effect of editing occasions
	// would be silent data loss, so the write must leave it alone.
	recorder := updateRecipeMetadataForTest(t, recipe.ID, "wife@example.com",
		`{"meal_occasions":["dinner"],"dish_type":"main","key_food_ids":[],"total_time_minutes":null}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("metadata write status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if listed := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipe.ID); listed.Cuisine != "Indian" {
		t.Errorf("cuisine after an older client's write = %q, want %q", listed.Cuisine, "Indian")
	}

	// The same rule applies field by field: dish_type and total time still
	// update, and an explicit empty cuisine is still a clear.
	recorder = updateRecipeMetadataForTest(t, recipe.ID, "wife@example.com",
		`{"meal_occasions":["lunch"],"dish_type":"side","key_food_ids":[],"total_time_minutes":30,"cuisine":""}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("explicit clear status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	listed := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipe.ID)
	if listed.Cuisine != "" {
		t.Errorf("cuisine after an explicit clear = %q, want empty", listed.Cuisine)
	}
	if listed.DishType != "side" || listed.TotalTimeMinutes == nil || *listed.TotalTimeMinutes != 30 {
		t.Errorf("other metadata beside the clear = dish %q, minutes %v", listed.DishType, listed.TotalTimeMinutes)
	}
}

func TestListRecipeCuisinesReturnsEachCuisineOnceSorted(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	// An empty household answers with an empty list, never null.
	if cuisines := listRecipeCuisinesForTest(t, "wife@example.com"); len(cuisines) != 0 {
		t.Fatalf("cuisines on an empty database = %v, want []", cuisines)
	}

	for _, cuisine := range []string{"Thai", "  Indian  ", "Chinese", "Thai", "   "} {
		createRecipeWithCuisineForTest(t, "wife@example.com", "Dish "+strings.TrimSpace(cuisine)+" "+cuisine, cuisine)
	}
	createRecipeWithCuisineForTest(t, "wife@example.com", "Apple loaf", "")

	cuisines := listRecipeCuisinesForTest(t, "wife@example.com")
	want := []string{"Chinese", "Indian", "Thai"}
	if len(cuisines) != len(want) {
		t.Fatalf("cuisines = %v, want %v", cuisines, want)
	}
	for index := range want {
		if cuisines[index] != want[index] {
			t.Fatalf("cuisines = %v, want %v", cuisines, want)
		}
	}
}
