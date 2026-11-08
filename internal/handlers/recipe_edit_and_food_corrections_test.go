package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"cals/internal/database"
	"cals/internal/models"
)

func createRecipeThroughAPIForTest(t *testing.T, email string, body any) models.Recipe {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encoding recipe input: %v", err)
	}
	recorder := httptest.NewRecorder()
	HandleCreateRecipe(recorder, authedRequest(t, http.MethodPost, "/api/recipes", string(encoded), email))
	if recorder.Code != http.StatusCreated {
		t.Fatalf("POST /api/recipes status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var recipe models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&recipe); err != nil {
		t.Fatalf("decoding created recipe: %v", err)
	}
	return recipe
}

func updateRecipeForTest(t *testing.T, recipeID int64, email string, body any) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encoding recipe update: %v", err)
	}
	req := authedRequest(t, http.MethodPut, "/api/recipes/"+itoa(recipeID), string(encoded), email)
	req.SetPathValue("id", itoa(recipeID))
	recorder := httptest.NewRecorder()
	HandleUpdateRecipe(recorder, req)
	return recorder
}

func createNutritionFoodForTest(t *testing.T, name string, calories, protein, carbs, fat, fibre float64) int64 {
	t.Helper()
	result, err := database.DB.Exec(`
		INSERT INTO foods (name, calories_per_100g, protein_per_100g, carbs_per_100g,
		                   fat_per_100g, fibre_per_100g)
		VALUES (?, ?, ?, ?, ?, ?)
	`, name, calories, protein, carbs, fat, fibre)
	if err != nil {
		t.Fatalf("inserting nutrition food %q: %v", name, err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("reading food id: %v", err)
	}
	return id
}

func recipeInput(name string, foodID int64, grams float64, manualWeight float64, manual bool) map[string]any {
	return map[string]any{
		"name":               name,
		"description":        "Original description",
		"instructions":       "Original method",
		"serves":             2,
		"total_weight_grams": manualWeight,
		"weight_is_manual":   manual,
		"ingredients":        []map[string]any{{"food_id": foodID, "quantity_grams": grams, "sort_order": 0}},
		"text_ingredients":   []map[string]any{{"description": "A pinch of seasoning", "sort_order": 0}},
	}
}

func logCurrentRecipeForTest(t *testing.T, email, date, meal string, recipe models.Recipe, grams float64) {
	t.Helper()
	body := map[string]any{
		"date": date, "meal": meal, "recipe_id": recipe.ID, "quantity_grams": grams,
		"calories": recipe.CaloriesPer100g * grams / 100,
		"protein":  recipe.ProteinPer100g * grams / 100,
		"carbs":    recipe.CarbsPer100g * grams / 100,
		"fat":      recipe.FatPer100g * grams / 100,
		"fibre":    recipe.FibrePer100g * grams / 100,
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encoding diary log: %v", err)
	}
	recorder := httptest.NewRecorder()
	HandleCreateDiaryEntry(recorder, authedRequest(t, http.MethodPost, "/api/diary", string(encoded), email))
	if recorder.Code != http.StatusCreated {
		t.Fatalf("POST /api/diary status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func foodUpdateBody(name string, calories, protein, carbs, fat, fibre float64) map[string]any {
	return map[string]any{
		"name": name, "calories_per_100g": calories, "protein_per_100g": protein,
		"carbs_per_100g": carbs, "fat_per_100g": fat, "fibre_per_100g": fibre,
		"servings": []map[string]any{},
	}
}

func assertDiaryNutritionUnchanged(t *testing.T, before, after DiaryResponse) {
	t.Helper()
	if before.Date != after.Date || before.Totals != after.Totals {
		t.Fatalf("diary day or totals changed: before=%+v after=%+v", before, after)
	}
	beforeEntries := append([]DiaryEntry(nil), before.Entries...)
	afterEntries := append([]DiaryEntry(nil), after.Entries...)
	for i := range beforeEntries {
		// Food labels are joined from the current food definition (decision 61),
		// so a correction may update FoodName but not the saved entry snapshot.
		beforeEntries[i].FoodName = ""
		afterEntries[i].FoodName = ""
	}
	if !reflect.DeepEqual(beforeEntries, afterEntries) {
		t.Fatalf("saved diary rows changed:\nbefore=%+v\nafter=%+v", beforeEntries, afterEntries)
	}
}

func TestRecipeEditKeepsEveryUsersDiarySnapshotsAndBankUnchanged(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	foodID := createNutritionFoodForTest(t, "Lentils", 100, 8, 18, 1, 7)
	recipe := createRecipeThroughAPIForTest(t, "wife@example.com", recipeInput("Lentil Stew", foodID, 100, 0, false))
	if recorder := setRecipeFavouriteForTest(t, recipe.ID, "wife@example.com", true); recorder.Code != http.StatusOK {
		t.Fatalf("setting favourite: status=%d body=%s", recorder.Code, recorder.Body.String())
	}

	logCurrentRecipeForTest(t, "wife@example.com", "2026-10-03", "dinner", recipe, 50)
	logCurrentRecipeForTest(t, "husband@example.com", "2026-10-03", "lunch", recipe, 25)
	wifeDiaryBefore := getDiaryForTest(t, "wife@example.com", "2026-10-03")
	husbandDiaryBefore := getDiaryForTest(t, "husband@example.com", "2026-10-03")
	wifeBankBefore := getBank(t, "wife@example.com", "2026-10-04")
	husbandBankBefore := getBank(t, "husband@example.com", "2026-10-04")

	updatedInput := recipeInput("Lentil Stew", foodID, 200, 100, true)
	updatedInput["description"] = "A revised description"
	updatedInput["instructions"] = "Simmer until tender."
	updatedInput["serves"] = 4
	updatedInput["text_ingredients"] = []map[string]any{
		{"description": "A pinch of seasoning", "sort_order": 0},
		{"description": "Fresh herbs", "sort_order": 1},
	}
	recorder := updateRecipeForTest(t, recipe.ID, "husband@example.com", updatedInput)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT /api/recipes status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var updated models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&updated); err != nil {
		t.Fatalf("decoding updated recipe: %v", err)
	}
	if updated.Name != "Lentil Stew" || updated.Description != "A revised description" || updated.Serves != 4 {
		t.Errorf("updated recipe content = %+v", updated)
	}
	if updated.TotalCalories != 200 || updated.TotalWeightGrams != 100 || !updated.WeightIsManual || updated.CaloriesPer100g != 200 {
		t.Errorf("updated cooked-weight nutrition = %+v, want 200 kcal / 100 g cooked", updated)
	}
	if len(updated.Ingredients) != 1 || updated.Ingredients[0].QuantityGrams != 200 || len(updated.TextIngredients) != 2 {
		t.Errorf("updated ingredients = %+v / %+v", updated.Ingredients, updated.TextIngredients)
	}

	assertDiaryNutritionUnchanged(t, wifeDiaryBefore, getDiaryForTest(t, "wife@example.com", "2026-10-03"))
	assertDiaryNutritionUnchanged(t, husbandDiaryBefore, getDiaryForTest(t, "husband@example.com", "2026-10-03"))
	if got := getBank(t, "wife@example.com", "2026-10-04"); got != wifeBankBefore {
		t.Errorf("wife's bank changed after recipe edit: before=%+v after=%+v", wifeBankBefore, got)
	}
	if got := getBank(t, "husband@example.com", "2026-10-04"); got != husbandBankBefore {
		t.Errorf("husband's bank changed after recipe edit: before=%+v after=%+v", husbandBankBefore, got)
	}

	wifeRecipe := getRecipeForTest(t, recipe.ID, "wife@example.com")
	husbandRecipe := getRecipeForTest(t, recipe.ID, "husband@example.com")
	if !wifeRecipe.IsFavourite || husbandRecipe.IsFavourite {
		t.Errorf("recipe edit changed personal favourite state: wife=%v husband=%v", wifeRecipe.IsFavourite, husbandRecipe.IsFavourite)
	}
	if wifeRecipe.UsualGrams == nil || *wifeRecipe.UsualGrams != 50 || husbandRecipe.UsualGrams == nil || *husbandRecipe.UsualGrams != 25 {
		t.Errorf("recipe edit changed personal usual portions: wife=%v husband=%v", wifeRecipe.UsualGrams, husbandRecipe.UsualGrams)
	}

	// A new portion uses the updated definition, while the earlier row remains
	// the original 50 kcal snapshot.
	logCurrentRecipeForTest(t, "wife@example.com", "2026-10-03", "snacks", wifeRecipe, 50)
	wifeDiaryAfterNewLog := getDiaryForTest(t, "wife@example.com", "2026-10-03")
	if len(wifeDiaryAfterNewLog.Entries) != 2 {
		t.Fatalf("wife diary rows after new log = %d, want 2", len(wifeDiaryAfterNewLog.Entries))
	}
	if wifeDiaryAfterNewLog.Entries[0].Calories != 50 || wifeDiaryAfterNewLog.Entries[1].Calories != 100 {
		t.Errorf("old/new log calories = %v/%v, want 50/100", wifeDiaryAfterNewLog.Entries[0].Calories, wifeDiaryAfterNewLog.Entries[1].Calories)
	}
}

func TestRecipeNameCannotBeChangedEvenBeforeFirstLog(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	foodID := createNutritionFoodForTest(t, "Rice", 130, 3, 28, 1, 1)
	recipe := createRecipeThroughAPIForTest(t, "wife@example.com", recipeInput("Rice Bowl", foodID, 100, 0, false))

	input := recipeInput("Renamed Bowl", foodID, 100, 0, false)
	recorder := updateRecipeForTest(t, recipe.ID, "wife@example.com", input)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("renaming an unlogged recipe status = %d, want 400; body=%s", recorder.Code, recorder.Body.String())
	}
	if got := getRecipeForTest(t, recipe.ID, "wife@example.com").Name; got != "Rice Bowl" {
		t.Errorf("recipe name changed to %q after refused rename", got)
	}
}

func TestFoodCorrectionRecalculatesAllDependentDefinitionsButNotHistory(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	foodID := createNutritionFoodForTest(t, "Chickken", 100, 10, 20, 5, 2)
	otherFoodID := createNutritionFoodForTest(t, "Rice", 130, 3, 28, 1, 1)

	manualRecipe := createRecipeThroughAPIForTest(t, "wife@example.com", recipeInput("Chicken Bake", foodID, 200, 100, true))
	archivedRecipe := createRecipeThroughAPIForTest(t, "wife@example.com", recipeInput("Archived Chicken Bowl", foodID, 200, 0, false))
	unrelatedRecipe := createRecipeThroughAPIForTest(t, "wife@example.com", recipeInput("Rice Bowl", otherFoodID, 150, 0, false))
	logCurrentRecipeForTest(t, "wife@example.com", "2026-10-03", "dinner", manualRecipe, 50)
	logCurrentRecipeForTest(t, "husband@example.com", "2026-10-03", "lunch", archivedRecipe, 50)
	if recorder := setRecipeArchivedForTest(t, archivedRecipe.ID, "wife@example.com", true); recorder.Code != http.StatusOK {
		t.Fatalf("archiving dependent recipe: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	foodDiaryBody := `{"date":"2026-10-03","meal":"breakfast","food_id":` + itoa(foodID) +
		`,"quantity_grams":40,"calories":40,"protein":4,"carbs":8,"fat":2,"fibre":0.8}`
	foodLog := httptest.NewRecorder()
	HandleCreateDiaryEntry(foodLog, authedRequest(t, http.MethodPost, "/api/diary", foodDiaryBody, "wife@example.com"))
	if foodLog.Code != http.StatusCreated {
		t.Fatalf("POST food diary entry status=%d body=%s", foodLog.Code, foodLog.Body.String())
	}

	wifeDiaryBefore := getDiaryForTest(t, "wife@example.com", "2026-10-03")
	husbandDiaryBefore := getDiaryForTest(t, "husband@example.com", "2026-10-03")
	wifeBankBefore := getBank(t, "wife@example.com", "2026-10-04")
	husbandBankBefore := getBank(t, "husband@example.com", "2026-10-04")

	recorder := updateFoodForTest(t, foodID, `{"name":"Chicken","calories_per_100g":250,"protein_per_100g":30,"carbs_per_100g":15,"fat_per_100g":12,"fibre_per_100g":6,"servings":[]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT /api/foods status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	updatedManual := getRecipeForTest(t, manualRecipe.ID, "wife@example.com")
	if updatedManual.TotalCalories != 500 || updatedManual.TotalProtein != 60 || updatedManual.TotalCarbs != 30 ||
		updatedManual.TotalFat != 24 || updatedManual.TotalFibre != 12 {
		t.Errorf("manual recipe nutrition was not recalculated: %+v", updatedManual)
	}
	if updatedManual.CalculatedWeightGrams != 200 || updatedManual.TotalWeightGrams != 100 || !updatedManual.WeightIsManual {
		t.Errorf("manual cooked weight was not preserved: calculated=%v total=%v manual=%v",
			updatedManual.CalculatedWeightGrams, updatedManual.TotalWeightGrams, updatedManual.WeightIsManual)
	}
	if updatedManual.CaloriesPer100g != 500 {
		t.Errorf("manual cooked-weight kcal/100g = %v, want 500", updatedManual.CaloriesPer100g)
	}

	updatedArchived := getRecipeForTest(t, archivedRecipe.ID, "husband@example.com")
	if !updatedArchived.IsArchived || updatedArchived.TotalCalories != 500 || updatedArchived.TotalWeightGrams != 200 {
		t.Errorf("archived dependent recipe was not recalculated/preserved: %+v", updatedArchived)
	}
	updatedUnrelated := getRecipeForTest(t, unrelatedRecipe.ID, "wife@example.com")
	if updatedUnrelated.TotalCalories != unrelatedRecipe.TotalCalories || updatedUnrelated.TotalWeightGrams != unrelatedRecipe.TotalWeightGrams {
		t.Errorf("unrelated recipe changed during food correction: before=%+v after=%+v", unrelatedRecipe, updatedUnrelated)
	}
	if got := updatedManual.Ingredients[0].FoodName; got != "Chicken" {
		t.Errorf("corrected food label in recipe = %q, want Chicken", got)
	}

	wifeDiaryAfter := getDiaryForTest(t, "wife@example.com", "2026-10-03")
	husbandDiaryAfter := getDiaryForTest(t, "husband@example.com", "2026-10-03")
	assertDiaryNutritionUnchanged(t, wifeDiaryBefore, wifeDiaryAfter)
	assertDiaryNutritionUnchanged(t, husbandDiaryBefore, husbandDiaryAfter)
	if got := getBank(t, "wife@example.com", "2026-10-04"); got != wifeBankBefore {
		t.Errorf("wife's bank changed after food correction: before=%+v after=%+v", wifeBankBefore, got)
	}
	if got := getBank(t, "husband@example.com", "2026-10-04"); got != husbandBankBefore {
		t.Errorf("husband's bank changed after food correction: before=%+v after=%+v", husbandBankBefore, got)
	}
	var correctedFoodName string
	for _, entry := range wifeDiaryAfter.Entries {
		if entry.FoodID != nil && *entry.FoodID == foodID {
			correctedFoodName = entry.FoodName
			if entry.Calories != 40 || entry.Protein != 4 || entry.Carbs != 8 || entry.Fat != 2 || entry.Fibre != 0.8 {
				t.Errorf("food diary snapshot changed after correction: %+v", entry)
			}
		}
	}
	if correctedFoodName != "Chicken" {
		t.Errorf("historic food label = %q, want corrected label Chicken", correctedFoodName)
	}

	// New recipe logs use the refreshed definition, not the saved historical one.
	logCurrentRecipeForTest(t, "wife@example.com", "2026-10-03", "snacks", updatedManual, 50)
	newDiary := getDiaryForTest(t, "wife@example.com", "2026-10-03")
	if len(newDiary.Entries) != len(wifeDiaryBefore.Entries)+1 || newDiary.Entries[len(newDiary.Entries)-1].Calories != 250 {
		t.Errorf("new log did not use corrected recipe nutrition: %+v", newDiary.Entries)
	}
}

func TestFoodCorrectionAndDependentRecipeRefreshAreAtomic(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	foodID := createNutritionFoodForTest(t, "Chicken", 100, 10, 20, 5, 2)
	recipe := createRecipeThroughAPIForTest(t, "wife@example.com", recipeInput("Chicken Bowl", foodID, 100, 0, false))

	if _, err := database.DB.Exec(`
		CREATE TRIGGER reject_recipe_nutrition_refresh
		BEFORE UPDATE OF total_calories ON recipes
		BEGIN SELECT RAISE(ABORT, 'forced recipe refresh failure'); END;
	`); err != nil {
		t.Fatalf("creating rollback trigger: %v", err)
	}

	recorder := updateFoodForTest(t, foodID, `{"name":"Corrected Chicken","calories_per_100g":250,"protein_per_100g":30,"carbs_per_100g":15,"fat_per_100g":12,"fibre_per_100g":6,"servings":[]}`)
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("food update with failed dependent refresh status=%d, want 500; body=%s", recorder.Code, recorder.Body.String())
	}

	var foodName string
	var calories float64
	if err := database.DB.QueryRow(`SELECT name, calories_per_100g FROM foods WHERE id = ?`, foodID).Scan(&foodName, &calories); err != nil {
		t.Fatalf("reading rolled-back food: %v", err)
	}
	if foodName != "Chicken" || calories != 100 {
		t.Errorf("food update partially committed: name=%q calories=%v", foodName, calories)
	}
	storedRecipe := getRecipeForTest(t, recipe.ID, "wife@example.com")
	if storedRecipe.TotalCalories != 100 {
		t.Errorf("dependent recipe update partially committed: total calories=%v", storedRecipe.TotalCalories)
	}
}

func TestUpdateRecipeRejectsMissingFoodAndInvalidQuantitiesWithoutPartialChanges(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	foodID := createNutritionFoodForTest(t, "Oats", 379, 13, 68, 7, 10)
	recipe := createRecipeThroughAPIForTest(t, "wife@example.com", recipeInput("Oat Bowl", foodID, 100, 0, false))
	before := getRecipeForTest(t, recipe.ID, "wife@example.com")

	invalidBodies := []struct {
		name  string
		input map[string]any
	}{
		{"unknown food", map[string]any{
			"name": before.Name, "serves": 1,
			"ingredients": []map[string]any{{"food_id": 999999, "quantity_grams": 50, "sort_order": 0}},
		}},
		{"zero quantity", map[string]any{
			"name": before.Name, "serves": 1,
			"ingredients": []map[string]any{{"food_id": foodID, "quantity_grams": 0, "sort_order": 0}},
		}},
		{"blank text ingredient", map[string]any{
			"name": before.Name, "serves": 1,
			"ingredients":      []map[string]any{{"food_id": foodID, "quantity_grams": 100, "sort_order": 0}},
			"text_ingredients": []map[string]any{{"description": "  ", "sort_order": 0}},
		}},
	}
	for _, test := range invalidBodies {
		t.Run(test.name, func(t *testing.T) {
			recorder := updateRecipeForTest(t, recipe.ID, "wife@example.com", test.input)
			if recorder.Code != http.StatusBadRequest {
				t.Errorf("status=%d, want 400; body=%s", recorder.Code, recorder.Body.String())
			}
			if after := getRecipeForTest(t, recipe.ID, "wife@example.com"); !reflect.DeepEqual(before, after) {
				t.Errorf("invalid update changed recipe:\nbefore=%+v\nafter=%+v", before, after)
			}
		})
	}
}

func TestRecipeContentUpdateRollsBackAllRowsOnInsertFailure(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	firstFood := createNutritionFoodForTest(t, "Oats", 379, 13, 68, 7, 10)
	secondFood := createNutritionFoodForTest(t, "Milk", 47, 3.4, 4.8, 1.7, 0)
	recipe := createRecipeThroughAPIForTest(t, "wife@example.com", recipeInput("Overnight Oats", firstFood, 100, 0, false))
	logCurrentRecipeForTest(t, "wife@example.com", "2026-10-03", "breakfast", recipe, 60)
	before := getRecipeForTest(t, recipe.ID, "wife@example.com")
	diaryBefore := getDiaryForTest(t, "wife@example.com", "2026-10-03")

	if _, err := database.DB.Exec(fmt.Sprintf(`
		CREATE TRIGGER reject_recipe_ingredient_insert
		BEFORE INSERT ON recipe_ingredients
		WHEN NEW.recipe_id = %d
		BEGIN SELECT RAISE(ABORT, 'forced recipe content failure'); END;
	`, recipe.ID)); err != nil {
		t.Fatalf("creating rollback trigger: %v", err)
	}

	input := recipeInput(recipe.Name, secondFood, 250, 0, false)
	input["description"] = "This must roll back"
	recorder := updateRecipeForTest(t, recipe.ID, "wife@example.com", input)
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("recipe update with failed ingredient insert status=%d, want 500; body=%s", recorder.Code, recorder.Body.String())
	}
	if after := getRecipeForTest(t, recipe.ID, "wife@example.com"); !reflect.DeepEqual(before, after) {
		t.Errorf("failed recipe update was partially committed:\nbefore=%+v\nafter=%+v", before, after)
	}
	assertDiaryNutritionUnchanged(t, diaryBefore, getDiaryForTest(t, "wife@example.com", "2026-10-03"))
}

func TestFoodCorrectionRejectsNegativeNutrition(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	foodID := createNutritionFoodForTest(t, "Oats", 379, 13, 68, 7, 10)
	recorder := updateFoodForTest(t, foodID, fmt.Sprintf(`{"name":"Oats","calories_per_100g":-1,"protein_per_100g":13,"carbs_per_100g":68,"fat_per_100g":7,"fibre_per_100g":10,"servings":[]}`))
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("negative nutrition status=%d, want 400; body=%s", recorder.Code, recorder.Body.String())
	}
}
