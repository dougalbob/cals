package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func logRecipeForTest(t *testing.T, recipeID int64, grams float64, makeUsual bool, meal, email string) *httptest.ResponseRecorder {
	t.Helper()
	body := `{"date":"2026-10-03","meal":"` + meal + `","recipe_id":` + itoa(recipeID) +
		`,"quantity_grams":` + strconv.FormatFloat(grams, 'f', -1, 64) +
		`,"calories":400,"protein":20,"carbs":30,"fat":15,"fibre":4`
	if makeUsual {
		body += `,"make_usual":true`
	}
	body += `}`

	recorder := httptest.NewRecorder()
	HandleCreateDiaryEntry(recorder, authedRequest(t, http.MethodPost, "/api/diary", body, email))
	return recorder
}

func usualGramsForTest(t *testing.T, recipeID int64, email string) *float64 {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := authedRequest(t, http.MethodGet, "/api/recipes/"+itoa(recipeID), "", email)
	req.SetPathValue("id", itoa(recipeID))
	HandleGetRecipe(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/recipes/%d status = %d, body = %s", recipeID, recorder.Code, recorder.Body.String())
	}
	var recipe struct {
		UsualGrams *float64 `json:"usual_grams"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&recipe); err != nil {
		t.Fatalf("decoding recipe: %v", err)
	}
	return recipe.UsualGrams
}

func TestFirstRecipeLogBecomesUsualAndLaterLogsAreOneOff(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)

	if got := usualGramsForTest(t, recipeID, "wife@example.com"); got != nil {
		t.Fatalf("new recipe should have no usual portion, got %v", *got)
	}

	if recorder := logRecipeForTest(t, recipeID, 350, false, "dinner", "wife@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("first log status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	usual := usualGramsForTest(t, recipeID, "wife@example.com")
	if usual == nil || *usual != 350 {
		t.Fatalf("after first log usual = %v, want 350", usual)
	}

	// A bigger portion on another day is one-off: it must not rewrite the usual.
	if recorder := logRecipeForTest(t, recipeID, 500, false, "lunch", "wife@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("second log status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if usual = usualGramsForTest(t, recipeID, "wife@example.com"); usual == nil || *usual != 350 {
		t.Fatalf("one-off log changed the usual: %v", usual)
	}

	// Only an explicit "make this my usual" replaces it.
	if recorder := logRecipeForTest(t, recipeID, 280, true, "dinner", "wife@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("make-usual log status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if usual = usualGramsForTest(t, recipeID, "wife@example.com"); usual == nil || *usual != 280 {
		t.Fatalf("make_usual did not update the usual: %v", usual)
	}
}

func TestUsualRecipePortionIsPrivateToEachUser(t *testing.T) {
	setupHandlerDB(t)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	recipeID := createTestRecipe(t, "Sunday Roast", wifeID)

	if recorder := logRecipeForTest(t, recipeID, 420, false, "dinner", "wife@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("wife log status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if recorder := logRecipeForTest(t, recipeID, 600, false, "dinner", "husband@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("husband log status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	if got := usualGramsForTest(t, recipeID, "wife@example.com"); got == nil || *got != 420 {
		t.Errorf("wife usual = %v, want 420", got)
	}
	if got := usualGramsForTest(t, recipeID, "husband@example.com"); got == nil || *got != 600 {
		t.Errorf("husband usual = %v, want 600", got)
	}
}

func TestFailedRecipeLogDoesNotRememberAPortion(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)

	// No meal: the handler refuses the log, so nothing should be remembered.
	recorder := httptest.NewRecorder()
	HandleCreateDiaryEntry(recorder, authedRequest(t, http.MethodPost, "/api/diary",
		`{"date":"2026-10-03","recipe_id":`+itoa(recipeID)+`,"quantity_grams":350}`, "wife@example.com"))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body = %s)", recorder.Code, recorder.Body.String())
	}
	if got := usualGramsForTest(t, recipeID, "wife@example.com"); got != nil {
		t.Fatalf("a refused log remembered a usual portion: %v", *got)
	}
}

func TestRecipeListCarriesTheUsualPortion(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)

	if recorder := logRecipeForTest(t, recipeID, 375, false, "dinner", "wife@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("log status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	recipe := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipeID)
	if recipe.UsualGrams == nil || *recipe.UsualGrams != 375 {
		t.Fatalf("list usual_grams = %v, want 375", recipe.UsualGrams)
	}
}
