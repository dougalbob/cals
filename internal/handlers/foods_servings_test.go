package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"cals/internal/database"
)

func createFoodForTest(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleCreateFood(recorder, authedRequest(t, http.MethodPost, "/api/foods", body, "wife@example.com"))
	return recorder
}

func updateFoodForTest(t *testing.T, id int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := authedRequest(t, http.MethodPut, "/api/foods/"+itoa(id), body, "wife@example.com")
	req.SetPathValue("id", itoa(id))
	HandleUpdateFood(recorder, req)
	return recorder
}

// foodResponseID returns a created food's numeric row id. The response type is
// interface{} so it can also carry "fs_<id>" for FatSecret results, and a JSON
// round-trip decodes numbers as float64.
func foodResponseID(t *testing.T, food FoodResponse) int64 {
	t.Helper()
	switch id := food.ID.(type) {
	case int64:
		return id
	case float64:
		return int64(id)
	}
	t.Fatalf("unexpected food id type %T", food.ID)
	return 0
}

func getFoodForTest(t *testing.T, id int64) FoodResponse {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := authedRequest(t, http.MethodGet, "/api/foods/"+itoa(id), "", "wife@example.com")
	req.SetPathValue("id", itoa(id))
	HandleGetFood(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/foods/%d status = %d, body = %s", id, recorder.Code, recorder.Body.String())
	}
	var food FoodResponse
	if err := json.NewDecoder(recorder.Body).Decode(&food); err != nil {
		t.Fatalf("decoding food: %v", err)
	}
	return food
}

func TestCreateFoodStoresNamedGramBackedMeasures(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	recorder := createFoodForTest(t, `{
		"name":"Hoops","brand":"Tesco","calories_per_100g":380,
		"serving_name":"1 bag","serving_grams":25,
		"servings":[{"description":"1 bag","grams":25},{"description":"1 slice","grams":12.5}]
	}`)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var created FoodResponse
	if err := json.NewDecoder(recorder.Body).Decode(&created); err != nil {
		t.Fatalf("decoding created food: %v", err)
	}
	if len(created.Servings) != 2 {
		t.Fatalf("created servings = %+v, want two named measures", created.Servings)
	}
	if created.Servings[0].Description != "1 bag" || created.Servings[0].Grams != 25 {
		t.Errorf("first measure = %+v, want 1 bag = 25 g", created.Servings[0])
	}
	if created.ServingName != "1 bag" || created.ServingGrams != 25 {
		t.Errorf("preferred serving = %q/%v, want 1 bag/25", created.ServingName, created.ServingGrams)
	}

	id := foodResponseID(t, created)
	loaded := getFoodForTest(t, id)
	if len(loaded.Servings) != 2 {
		t.Fatalf("reloaded servings = %+v, want two", loaded.Servings)
	}

	// The custom-foods list feeds the Foods screen, so it carries the measures too.
	recorder = httptest.NewRecorder()
	HandleGetCustomFoods(recorder, authedRequest(t, http.MethodGet, "/api/foods/custom", "", "wife@example.com"))
	var custom []FoodResponse
	if err := json.NewDecoder(recorder.Body).Decode(&custom); err != nil {
		t.Fatalf("decoding custom foods: %v", err)
	}
	if len(custom) != 1 || len(custom[0].Servings) != 2 {
		t.Fatalf("custom foods = %+v, want one food with two measures", custom)
	}
}

func TestUpdateFoodReplacesOnlyHouseholdMeasures(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	result, err := database.DB.Exec(`INSERT INTO foods (name, fatsecret_id, calories_per_100g) VALUES ('Porridge Oats', 'fs_1001', 379)`)
	if err != nil {
		t.Fatalf("inserting food: %v", err)
	}
	foodID, _ := result.LastInsertId()

	// A FatSecret-provided measure (as cached by the FatSecret import) plus an
	// older household measure that this edit should replace.
	if _, err := database.DB.Exec(`
		INSERT INTO food_servings (food_id, fatsecret_serving_id, description, grams) VALUES (?, 'abc', '40g portion', 40)
	`, foodID); err != nil {
		t.Fatalf("inserting fatsecret serving: %v", err)
	}
	if _, err := database.DB.Exec(`
		INSERT INTO food_servings (food_id, description, grams) VALUES (?, '1 scoop', 30)
	`, foodID); err != nil {
		t.Fatalf("inserting custom serving: %v", err)
	}

	recorder := updateFoodForTest(t, foodID, `{
		"name":"Porridge Oats","calories_per_100g":379,
		"serving_name":"1 scoop","serving_grams":30,
		"servings":[{"description":"1 scoop","grams":30},{"description":"1 big bowl","grams":80}]
	}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var updated FoodResponse
	if err := json.NewDecoder(recorder.Body).Decode(&updated); err != nil {
		t.Fatalf("decoding updated food: %v", err)
	}
	if len(updated.Servings) != 3 {
		t.Fatalf("updated servings = %+v, want the FatSecret measure plus two household measures", updated.Servings)
	}
	if updated.Servings[0].FatSecretServingID != "abc" {
		t.Errorf("FatSecret measure should stay and stay first: %+v", updated.Servings[0])
	}
	descriptions := map[string]float64{}
	for _, serving := range updated.Servings {
		descriptions[serving.Description] = serving.Grams
	}
	if descriptions["1 big bowl"] != 80 {
		t.Errorf("new measure missing or wrong: %+v", descriptions)
	}
	if _, stale := descriptions["1 scoop"]; !stale {
		t.Errorf("submitted measure missing: %+v", descriptions)
	}

	// Editing a FatSecret-derived food marks it edited but must not make it
	// deletable as a custom food.
	var fatsecretID string
	if err := database.DB.QueryRow(`SELECT fatsecret_id FROM foods WHERE id = ?`, foodID).Scan(&fatsecretID); err != nil {
		t.Fatalf("reading fatsecret id: %v", err)
	}
	if fatsecretID != "fs_1001" {
		t.Errorf("fatsecret_id = %q, want fs_1001", fatsecretID)
	}
}

func TestFoodMeasuresAreValidated(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	cases := []struct {
		name string
		body string
		want string
	}{
		{
			name: "missing description",
			body: `{"name":"Hoops","servings":[{"description":"  ","grams":25}]}`,
			want: "Every named measure needs a description",
		},
		{
			name: "zero grams",
			body: `{"name":"Hoops","servings":[{"description":"1 bag","grams":0}]}`,
			want: `The measure "1 bag" needs a weight in grams greater than zero`,
		},
		{
			name: "duplicate measures",
			body: `{"name":"Hoops","servings":[{"description":"1 bag","grams":25},{"description":"1 Bag","grams":30}]}`,
			want: "Duplicate named measure: 1 Bag",
		},
		{
			name: "preferred serving without grams",
			body: `{"name":"Hoops","serving_name":"1 bag"}`,
			want: "The preferred serving needs a weight in grams greater than zero",
		},
		{
			name: "missing name",
			body: `{"servings":[{"description":"1 bag","grams":25}]}`,
			want: "Name is required",
		},
	}

	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			recorder := createFoodForTest(t, test.body)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body = %s)", recorder.Code, recorder.Body.String())
			}
			if got := recorder.Body.String(); got != test.want+"\n" {
				t.Errorf("body = %q, want %q", got, test.want)
			}
		})
	}
}

func TestUpdateUnknownFoodReturns404(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	recorder := updateFoodForTest(t, 4242, `{"name":"Ghost","calories_per_100g":1}`)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body = %s)", recorder.Code, recorder.Body.String())
	}
}

func TestDiaryEntriesCarryFoodMeasureMetadata(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	recorder := createFoodForTest(t, `{
		"name":"Hoops","calories_per_100g":380,"serving_name":"1 bag","serving_grams":25,
		"servings":[{"description":"1 bag","grams":25}]
	}`)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var created FoodResponse
	if err := json.NewDecoder(recorder.Body).Decode(&created); err != nil {
		t.Fatalf("decoding created food: %v", err)
	}
	foodID := foodResponseID(t, created)

	if _, err := database.DB.Exec(`
		INSERT INTO diary_entries (user_id, date, meal, food_id, quantity_grams, calories)
		VALUES (?, '2026-10-03', 'snacks', ?, 25, 95)
	`, userID, foodID); err != nil {
		t.Fatalf("inserting diary entry: %v", err)
	}

	recorder = httptest.NewRecorder()
	HandleGetDiary(recorder, authedRequest(t, http.MethodGet, "/api/diary?date=2026-10-03", "", "wife@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/diary status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var diary DiaryResponse
	if err := json.NewDecoder(recorder.Body).Decode(&diary); err != nil {
		t.Fatalf("decoding diary: %v", err)
	}
	if len(diary.Entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(diary.Entries))
	}
	entry := diary.Entries[0]
	if entry.FoodServingName != "1 bag" || entry.FoodServingGrams != 25 {
		t.Errorf("entry serving = %q/%v, want 1 bag/25", entry.FoodServingName, entry.FoodServingGrams)
	}
	if len(entry.FoodServings) != 1 || entry.FoodServings[0].Description != "1 bag" {
		t.Errorf("entry servings = %+v, want the food's named measure", entry.FoodServings)
	}

	// A recipe entry has no food measures, and must not pretend otherwise.
	recipeID := createTestRecipe(t, "Chicken Curry", userID)
	if _, err := database.DB.Exec(`
		INSERT INTO diary_entries (user_id, date, meal, recipe_id, quantity_grams, calories)
		VALUES (?, '2026-10-03', 'dinner', ?, 300, 480)
	`, userID, recipeID); err != nil {
		t.Fatalf("inserting recipe entry: %v", err)
	}

	recorder = httptest.NewRecorder()
	HandleGetDiary(recorder, authedRequest(t, http.MethodGet, "/api/diary?date=2026-10-03", "", "wife@example.com"))
	// A fresh value: decoding into the previous response would merge into its
	// existing entries rather than replacing them.
	var withRecipe DiaryResponse
	if err := json.NewDecoder(recorder.Body).Decode(&withRecipe); err != nil {
		t.Fatalf("decoding diary: %v", err)
	}
	if len(withRecipe.Entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(withRecipe.Entries))
	}
	for _, entry := range withRecipe.Entries {
		if entry.RecipeID != nil && (entry.FoodServingName != "" || len(entry.FoodServings) != 0) {
			t.Errorf("recipe entry carries food measures: %+v", entry)
		}
	}
}

func TestFoodSearchCarriesNamedMeasures(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)

	if recorder := createFoodForTest(t, `{
		"name":"Hoops","calories_per_100g":380,"serving_name":"1 bag","serving_grams":25,
		"servings":[{"description":"1 bag","grams":25},{"description":"1 slice","grams":12.5}]
	}`); recorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	// The diary's Add sheet reads measures straight from search results.
	recorder := httptest.NewRecorder()
	HandleSearchFoods(recorder, authedRequest(t, http.MethodGet, "/api/foods/search?q=Hoops", "", "wife@example.com"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("search status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var results []FoodResponse
	if err := json.NewDecoder(recorder.Body).Decode(&results); err != nil {
		t.Fatalf("decoding search results: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("results = %d, want 1", len(results))
	}
	if len(results[0].Servings) != 2 {
		t.Fatalf("search result servings = %+v, want two named measures", results[0].Servings)
	}
	if results[0].Servings[0].Description != "1 bag" || results[0].Servings[1].Grams != 12.5 {
		t.Errorf("search result measures = %+v", results[0].Servings)
	}
}
