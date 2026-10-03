package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"cals/internal/database"
	"cals/internal/models"
)

func createTestRecipe(t *testing.T, name string, creatorID int64) int64 {
	t.Helper()
	result, err := database.DB.Exec(`
		INSERT INTO recipes (name, created_by_user_id) VALUES (?, ?)
	`, name, creatorID)
	if err != nil {
		t.Fatalf("inserting recipe: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("reading recipe id: %v", err)
	}
	return id
}

func listRecipesForTest(t *testing.T, email string) []models.Recipe {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleListRecipes(recorder, authedRequest(t, http.MethodGet, "/api/recipes", "", email))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/recipes status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var recipes []models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&recipes); err != nil {
		t.Fatalf("decoding recipe list: %v", err)
	}
	return recipes
}

func createNamedFoodForRecipeTest(t *testing.T, name string) int64 {
	t.Helper()
	result, err := database.DB.Exec(`INSERT INTO foods (name, calories_per_100g) VALUES (?, 150)`, name)
	if err != nil {
		t.Fatalf("inserting food %q: %v", name, err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("reading food id: %v", err)
	}
	return id
}

func addRecipeFoodForTest(t *testing.T, recipeID, foodID int64) {
	t.Helper()
	if _, err := database.DB.Exec(`
		INSERT INTO recipe_ingredients (recipe_id, food_id, quantity_grams, sort_order)
		VALUES (?, ?, 100, 0)
	`, recipeID, foodID); err != nil {
		t.Fatalf("adding recipe food: %v", err)
	}
}

func updateRecipeMetadataForTest(t *testing.T, recipeID int64, email, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := authedRequest(t, http.MethodPut,
		"/api/recipes/"+strconv.FormatInt(recipeID, 10)+"/metadata", body, email)
	req.SetPathValue("id", strconv.FormatInt(recipeID, 10))
	recorder := httptest.NewRecorder()
	HandleUpdateRecipeMetadata(recorder, req)
	return recorder
}

func setRecipeFavouriteForTest(t *testing.T, recipeID int64, email string, favourite bool) *httptest.ResponseRecorder {
	t.Helper()
	req := authedRequest(t, http.MethodPut,
		"/api/recipes/"+strconv.FormatInt(recipeID, 10)+"/favourite",
		`{"is_favourite":`+strconv.FormatBool(favourite)+`}`, email)
	req.SetPathValue("id", strconv.FormatInt(recipeID, 10))
	recorder := httptest.NewRecorder()
	HandleSetRecipeFavourite(recorder, req)
	return recorder
}

func findRecipe(t *testing.T, recipes []models.Recipe, id int64) models.Recipe {
	t.Helper()
	for _, recipe := range recipes {
		if recipe.ID == id {
			return recipe
		}
	}
	t.Fatalf("recipe %d not found in list", id)
	return models.Recipe{}
}

func TestRecipeFavouriteIsPrivateToSignedInUser(t *testing.T) {
	setupHandlerDB(t)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	recipeID := createTestRecipe(t, "Chicken Curry", wifeID)

	if got := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipeID).IsFavourite; got {
		t.Fatal("new recipe should not start as a favourite")
	}

	recorder := setRecipeFavouriteForTest(t, recipeID, "wife@example.com", true)
	if recorder.Code != http.StatusOK {
		t.Fatalf("setting favourite status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response map[string]bool
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decoding favourite response: %v", err)
	}
	if !response["is_favourite"] {
		t.Fatal("favourite response should be true")
	}

	if got := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipeID).IsFavourite; !got {
		t.Error("favourite should be visible to the user who set it")
	}
	if got := findRecipe(t, listRecipesForTest(t, "husband@example.com"), recipeID).IsFavourite; got {
		t.Error("favourite must not leak to another user of the shared recipe")
	}

	// Repeating a set is idempotent, and the user can later clear it.
	if recorder := setRecipeFavouriteForTest(t, recipeID, "wife@example.com", true); recorder.Code != http.StatusOK {
		t.Fatalf("repeating favourite status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if recorder := setRecipeFavouriteForTest(t, recipeID, "wife@example.com", false); recorder.Code != http.StatusOK {
		t.Fatalf("clearing favourite status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipeID).IsFavourite; got {
		t.Error("cleared favourite should be false")
	}
}

func TestSetRecipeFavouriteRejectsInvalidRequests(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)

	req := authedRequest(t, http.MethodPut, "/api/recipes/1/favourite", `{}`, "wife@example.com")
	req.SetPathValue("id", strconv.FormatInt(recipeID, 10))
	recorder := httptest.NewRecorder()
	HandleSetRecipeFavourite(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("missing is_favourite status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	if recorder := setRecipeFavouriteForTest(t, recipeID+100, "wife@example.com", true); recorder.Code != http.StatusNotFound {
		t.Errorf("unknown recipe status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestRecipeMetadataIsSharedAndUsesKnownRecipeFoods(t *testing.T) {
	setupHandlerDB(t)
	creatorID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	chickenID := createNamedFoodForRecipeTest(t, "Chicken breast")
	riceID := createNamedFoodForRecipeTest(t, "Basmati rice")
	recipeID := createTestRecipe(t, "Chicken Bowl", creatorID)
	addRecipeFoodForTest(t, recipeID, chickenID)
	addRecipeFoodForTest(t, recipeID, riceID)

	recorder := updateRecipeMetadataForTest(t, recipeID, "wife@example.com",
		`{"meal_occasions":["lunch","dinner"],"dish_type":"main","key_food_ids":[`+
			strconv.FormatInt(chickenID, 10)+`, `+strconv.FormatInt(riceID, 10)+`],"total_time_minutes":45}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT metadata status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var updated models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&updated); err != nil {
		t.Fatalf("decoding metadata response: %v", err)
	}
	if updated.DishType != "main" || updated.TotalTimeMinutes == nil || *updated.TotalTimeMinutes != 45 {
		t.Errorf("metadata response = %+v, want main / 45 minutes", updated)
	}
	if len(updated.MealOccasions) != 2 || updated.MealOccasions[0] != "lunch" || updated.MealOccasions[1] != "dinner" {
		t.Errorf("meal occasions = %v, want [lunch dinner]", updated.MealOccasions)
	}
	if len(updated.KeyFoods) != 2 || updated.KeyFoods[0].FoodID != chickenID || updated.KeyFoods[1].FoodID != riceID {
		t.Errorf("key foods = %+v, want chicken and rice IDs", updated.KeyFoods)
	}

	for _, email := range []string{"wife@example.com", "husband@example.com"} {
		listed := findRecipe(t, listRecipesForTest(t, email), recipeID)
		if listed.DishType != "main" || listed.TotalTimeMinutes == nil || *listed.TotalTimeMinutes != 45 {
			t.Errorf("shared metadata for %s = %+v", email, listed)
		}
		if len(listed.MealOccasions) != 2 || len(listed.KeyFoods) != 2 {
			t.Errorf("shared tags for %s = %+v", email, listed)
		}
	}

	// The detail endpoint returns the same shared metadata while favourites remain personal.
	if recorder := setRecipeFavouriteForTest(t, recipeID, "wife@example.com", true); recorder.Code != http.StatusOK {
		t.Fatalf("setting favourite status = %d", recorder.Code)
	}
	wifeRecipe := getRecipeForTest(t, recipeID, "wife@example.com")
	husbandRecipe := getRecipeForTest(t, recipeID, "husband@example.com")
	if !wifeRecipe.IsFavourite || husbandRecipe.IsFavourite {
		t.Errorf("favourite state should remain user-scoped: wife=%v husband=%v", wifeRecipe.IsFavourite, husbandRecipe.IsFavourite)
	}
	if wifeRecipe.DishType != husbandRecipe.DishType || len(wifeRecipe.MealOccasions) != len(husbandRecipe.MealOccasions) {
		t.Errorf("shared metadata differs across users: wife=%+v husband=%+v", wifeRecipe, husbandRecipe)
	}

	if recorder := updateRecipeMetadataForTest(t, recipeID, "wife@example.com",
		`{"meal_occasions":[],"dish_type":"","key_food_ids":[],"total_time_minutes":null}`); recorder.Code != http.StatusOK {
		t.Fatalf("clearing recipe metadata status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	cleared := getRecipeForTest(t, recipeID, "wife@example.com")
	if len(cleared.MealOccasions) != 0 || len(cleared.KeyFoods) != 0 || cleared.DishType != "" || cleared.TotalTimeMinutes != nil {
		t.Errorf("metadata did not clear: %+v", cleared)
	}
}

func getRecipeForTest(t *testing.T, recipeID int64, email string) models.Recipe {
	t.Helper()
	req := authedRequest(t, http.MethodGet,
		"/api/recipes/"+strconv.FormatInt(recipeID, 10), "", email)
	req.SetPathValue("id", strconv.FormatInt(recipeID, 10))
	recorder := httptest.NewRecorder()
	HandleGetRecipe(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET recipe status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var recipe models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&recipe); err != nil {
		t.Fatalf("decoding recipe detail: %v", err)
	}
	return recipe
}

func TestRecipeMetadataRejectsInvalidFacetAndKeyFoodValues(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	ingredientID := createNamedFoodForRecipeTest(t, "Chicken")
	otherFoodID := createNamedFoodForRecipeTest(t, "Spinach")
	recipeID := createTestRecipe(t, "Chicken Bowl", userID)
	addRecipeFoodForTest(t, recipeID, ingredientID)

	invalidBodies := []struct {
		name string
		body string
	}{
		{"unknown occasion", `{"meal_occasions":["brunch"]}`},
		{"duplicate occasion", `{"meal_occasions":["lunch","lunch"]}`},
		{"unknown dish type", `{"dish_type":"casserole"}`},
		{"more than two key foods", `{"key_food_ids":[1,2,3]}`},
		{"food not in recipe", `{"key_food_ids":[` + strconv.FormatInt(otherFoodID, 10) + `]}`},
		{"zero minutes", `{"total_time_minutes":0}`},
		{"fractional minutes", `{"total_time_minutes":1.5}`},
	}
	for _, test := range invalidBodies {
		t.Run(test.name, func(t *testing.T) {
			recorder := updateRecipeMetadataForTest(t, recipeID, "wife@example.com", test.body)
			if recorder.Code != http.StatusBadRequest {
				t.Errorf("status = %d, body = %s; want %d", recorder.Code, recorder.Body.String(), http.StatusBadRequest)
			}
		})
	}

	if recorder := updateRecipeMetadataForTest(t, recipeID+100, "wife@example.com", `{}`); recorder.Code != http.StatusNotFound {
		t.Errorf("unknown recipe status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}
