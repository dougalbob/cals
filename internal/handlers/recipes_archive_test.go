package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cals/internal/database"
	"cals/internal/models"
)

// Decision 59: recipes are retired by archiving. These tests pin the
// guarantees that make that safe — history is never touched, an archived recipe
// cannot be logged again, and nothing a client can do deletes a logged recipe.

func setRecipeArchivedForTest(t *testing.T, recipeID int64, email string, archived bool) *httptest.ResponseRecorder {
	t.Helper()
	req := authedRequest(t, http.MethodPut,
		"/api/recipes/"+itoa(recipeID)+"/archive",
		`{"is_archived":`+boolJSON(archived)+`}`, email)
	req.SetPathValue("id", itoa(recipeID))
	recorder := httptest.NewRecorder()
	HandleSetRecipeArchived(recorder, req)
	return recorder
}

func boolJSON(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func listRecipesIncludingArchivedForTest(t *testing.T, email string) []models.Recipe {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleListRecipes(recorder, authedRequest(t, http.MethodGet, "/api/recipes?include_archived=true", "", email))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/recipes?include_archived=true status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var recipes []models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&recipes); err != nil {
		t.Fatalf("decoding recipe list: %v", err)
	}
	return recipes
}

func containsRecipe(recipes []models.Recipe, id int64) bool {
	for _, recipe := range recipes {
		if recipe.ID == id {
			return true
		}
	}
	return false
}

func getDiaryForTest(t *testing.T, email, date string) DiaryResponse {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetDiary(recorder, authedRequest(t, http.MethodGet, "/api/diary?date="+date, "", email))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/diary status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response DiaryResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decoding diary: %v", err)
	}
	return response
}

func getRecipeDetailForTest(t *testing.T, recipeID int64, email string) *httptest.ResponseRecorder {
	t.Helper()
	req := authedRequest(t, http.MethodGet, "/api/recipes/"+itoa(recipeID), "", email)
	req.SetPathValue("id", itoa(recipeID))
	recorder := httptest.NewRecorder()
	HandleGetRecipe(recorder, req)
	return recorder
}

func deleteRecipeForTest(t *testing.T, recipeID int64, email string) *httptest.ResponseRecorder {
	t.Helper()
	req := authedRequest(t, http.MethodDelete, "/api/recipes/"+itoa(recipeID), "", email)
	req.SetPathValue("id", itoa(recipeID))
	recorder := httptest.NewRecorder()
	HandleDeleteRecipe(recorder, req)
	return recorder
}

func TestNewAndMigratedRecipesAreNotArchived(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)

	recipes := listRecipesForTest(t, "wife@example.com")
	if !containsRecipe(recipes, recipeID) {
		t.Fatal("a recipe that was never archived must be listed")
	}
	if findRecipe(t, recipes, recipeID).IsArchived {
		t.Error("recipes default to not archived")
	}
}

func TestArchivedRecipeIsHiddenFromTheListUnlessAskedFor(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	keepID := createTestRecipe(t, "Shepherd's Pie", userID)
	retireID := createTestRecipe(t, "Chicken Curry", userID)

	recorder := setRecipeArchivedForTest(t, retireID, "wife@example.com", true)
	if recorder.Code != http.StatusOK {
		t.Fatalf("archive status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var archived models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&archived); err != nil {
		t.Fatalf("decoding archive response: %v", err)
	}
	if !archived.IsArchived || archived.ID != retireID {
		t.Fatalf("archive response = %+v, want archived recipe %d", archived, retireID)
	}

	// Default list (what the legacy UI and every picker use) hides it — for
	// the other household member too, because archiving is household-wide.
	for _, email := range []string{"wife@example.com", "husband@example.com"} {
		recipes := listRecipesForTest(t, email)
		if containsRecipe(recipes, retireID) {
			t.Errorf("%s: archived recipe is still in the default list", email)
		}
		if !containsRecipe(recipes, keepID) {
			t.Errorf("%s: archiving one recipe hid another", email)
		}
	}

	// The opt-in list returns both, flagged.
	all := listRecipesIncludingArchivedForTest(t, "husband@example.com")
	if !findRecipe(t, all, retireID).IsArchived {
		t.Error("include_archived list should flag the archived recipe")
	}
	if findRecipe(t, all, keepID).IsArchived {
		t.Error("include_archived list flagged a recipe that is not archived")
	}

	// Restore puts it back in the default list.
	if recorder := setRecipeArchivedForTest(t, retireID, "wife@example.com", false); recorder.Code != http.StatusOK {
		t.Fatalf("restore status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if recipes := listRecipesForTest(t, "wife@example.com"); !containsRecipe(recipes, retireID) || findRecipe(t, recipes, retireID).IsArchived {
		t.Error("a restored recipe must be listed and no longer archived")
	}
}

func TestArchivedRecipeStillOpensByLink(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)
	setRecipeArchivedForTest(t, recipeID, "wife@example.com", true)

	recorder := getRecipeDetailForTest(t, recipeID, "wife@example.com")
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET archived recipe status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var recipe models.Recipe
	if err := json.NewDecoder(recorder.Body).Decode(&recipe); err != nil {
		t.Fatalf("decoding recipe: %v", err)
	}
	if !recipe.IsArchived {
		t.Error("an archived recipe's detail must say it is archived")
	}
}

// The core promise: archiving and restoring change no recorded nutrition, no
// day total, no bank figure, and the historic row keeps its recipe name/link.
func TestArchivingARecipeLeavesHistoryByteIdentical(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)

	if recorder := logRecipeForTest(t, recipeID, 350, false, "dinner", "wife@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("log status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	beforeDiary := getDiaryForTest(t, "wife@example.com", "2026-10-03")
	beforeBank := getBank(t, "wife@example.com", "2026-10-04")
	if len(beforeDiary.Entries) != 1 {
		t.Fatalf("entries before = %d, want 1", len(beforeDiary.Entries))
	}

	check := func(stage string) {
		t.Helper()
		after := getDiaryForTest(t, "wife@example.com", "2026-10-03")
		if len(after.Entries) != 1 {
			t.Fatalf("%s: entries = %d, want 1", stage, len(after.Entries))
		}
		got, want := after.Entries[0], beforeDiary.Entries[0]
		if got.Calories != want.Calories || got.Protein != want.Protein || got.Carbs != want.Carbs ||
			got.Fat != want.Fat || got.Fibre != want.Fibre || got.QuantityGrams != want.QuantityGrams {
			t.Errorf("%s: diary row nutrition changed: got %+v, want %+v", stage, got, want)
		}
		if got.RecipeName != "Chicken Curry" || got.RecipeID == nil || *got.RecipeID != recipeID {
			t.Errorf("%s: history lost its recipe label/link: name=%q id=%v", stage, got.RecipeName, got.RecipeID)
		}
		if after.Totals != beforeDiary.Totals {
			t.Errorf("%s: day totals changed: got %+v, want %+v", stage, after.Totals, beforeDiary.Totals)
		}
		if bank := getBank(t, "wife@example.com", "2026-10-04"); bank != beforeBank {
			t.Errorf("%s: bank changed: got %+v, want %+v", stage, bank, beforeBank)
		}
	}

	setRecipeArchivedForTest(t, recipeID, "wife@example.com", true)
	check("archived")
	setRecipeArchivedForTest(t, recipeID, "wife@example.com", false)
	check("restored")
}

func TestArchivedRecipeCannotBeLoggedUntilRestored(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)
	setRecipeArchivedForTest(t, recipeID, "wife@example.com", true)

	recorder := logRecipeForTest(t, recipeID, 350, false, "dinner", "wife@example.com")
	if recorder.Code != http.StatusConflict {
		t.Fatalf("logging an archived recipe status = %d, want 409; body = %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil || !strings.Contains(body.Error, "archived") {
		t.Errorf("409 body should explain the recipe is archived, got %q (err %v)", body.Error, err)
	}
	if entries := getDiaryForTest(t, "wife@example.com", "2026-10-03").Entries; len(entries) != 0 {
		t.Errorf("a refused log must not create a diary row, got %d", len(entries))
	}
	if got := usualGramsForTest(t, recipeID, "wife@example.com"); got != nil {
		t.Errorf("a refused log must not teach a usual portion, got %v", *got)
	}

	setRecipeArchivedForTest(t, recipeID, "wife@example.com", false)
	if recorder := logRecipeForTest(t, recipeID, 350, false, "dinner", "wife@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("logging after restore status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestArchivingKeepsFavouritesAndUsualPortions(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)
	logRecipeForTest(t, recipeID, 350, false, "dinner", "wife@example.com")
	setRecipeFavouriteForTest(t, recipeID, "wife@example.com", true)

	setRecipeArchivedForTest(t, recipeID, "wife@example.com", true)
	setRecipeArchivedForTest(t, recipeID, "wife@example.com", false)

	recipe := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipeID)
	if !recipe.IsFavourite {
		t.Error("favourite was lost across archive/restore")
	}
	if recipe.UsualGrams == nil || *recipe.UsualGrams != 350 {
		t.Errorf("usual portion was lost across archive/restore: %v", recipe.UsualGrams)
	}
}

func TestArchiveIsIdempotentAndKeepsOriginalTimestamp(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)

	setRecipeArchivedForTest(t, recipeID, "wife@example.com", true)
	if _, err := database.DB.Exec(`UPDATE recipes SET archived_at = '2026-01-02 03:04:05' WHERE id = ?`, recipeID); err != nil {
		t.Fatalf("pinning archived_at: %v", err)
	}
	if recorder := setRecipeArchivedForTest(t, recipeID, "husband@example.com", true); recorder.Code != http.StatusOK {
		t.Fatalf("repeat archive status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var archivedAt string
	if err := database.DB.QueryRow(`SELECT archived_at FROM recipes WHERE id = ?`, recipeID).Scan(&archivedAt); err != nil {
		t.Fatalf("reading archived_at: %v", err)
	}
	if !strings.Contains(archivedAt, "2026-01-02") {
		t.Errorf("re-archiving replaced the original archived_at: %q", archivedAt)
	}

	setRecipeArchivedForTest(t, recipeID, "wife@example.com", false)
	var archivedAtAfterRestore *string
	if err := database.DB.QueryRow(`SELECT archived_at FROM recipes WHERE id = ?`, recipeID).Scan(&archivedAtAfterRestore); err != nil {
		t.Fatalf("reading archived_at: %v", err)
	}
	if archivedAtAfterRestore != nil {
		t.Errorf("restore should clear archived_at, got %q", *archivedAtAfterRestore)
	}
}

func TestSetRecipeArchivedRejectsInvalidRequests(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)

	tests := []struct {
		name string
		id   string
		body string
		want int
	}{
		{"unknown recipe", "9999", `{"is_archived":true}`, http.StatusNotFound},
		{"bad id", "abc", `{"is_archived":true}`, http.StatusBadRequest},
		{"missing flag", itoa(recipeID), `{}`, http.StatusBadRequest},
		{"not json", itoa(recipeID), `nope`, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := authedRequest(t, http.MethodPut, "/api/recipes/"+tt.id+"/archive", tt.body, "wife@example.com")
			req.SetPathValue("id", tt.id)
			recorder := httptest.NewRecorder()
			HandleSetRecipeArchived(recorder, req)
			if recorder.Code != tt.want {
				t.Errorf("status = %d, want %d; body = %s", recorder.Code, tt.want, recorder.Body.String())
			}
		})
	}
	if recipe := findRecipe(t, listRecipesForTest(t, "wife@example.com"), recipeID); recipe.IsArchived {
		t.Error("an invalid request must not archive the recipe")
	}
}

func TestDeletingALoggedRecipeIsRefusedWithAClearConflict(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", userID)
	logRecipeForTest(t, recipeID, 350, false, "dinner", "wife@example.com")

	recorder := deleteRecipeForTest(t, recipeID, "wife@example.com")
	if recorder.Code != http.StatusConflict {
		t.Fatalf("delete of a logged recipe status = %d, want 409; body = %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil || !strings.Contains(body.Error, "Archive") {
		t.Errorf("409 body should point at archiving, got %q (err %v)", body.Error, err)
	}
	if !containsRecipe(listRecipesForTest(t, "wife@example.com"), recipeID) {
		t.Error("the recipe must survive a refused delete")
	}
	if entries := getDiaryForTest(t, "wife@example.com", "2026-10-03").Entries; len(entries) != 1 {
		t.Errorf("history must survive a refused delete, got %d entries", len(entries))
	}

	// An archived recipe with history is still protected from deletion.
	setRecipeArchivedForTest(t, recipeID, "wife@example.com", true)
	if recorder := deleteRecipeForTest(t, recipeID, "wife@example.com"); recorder.Code != http.StatusConflict {
		t.Errorf("delete of an archived, logged recipe status = %d, want 409", recorder.Code)
	}
}

func TestDeletingAnUnloggedRecipeStillWorks(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Typo Stew", userID)

	if recorder := deleteRecipeForTest(t, recipeID, "wife@example.com"); recorder.Code != http.StatusNoContent {
		t.Fatalf("delete of an unlogged recipe status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if containsRecipe(listRecipesIncludingArchivedForTest(t, "wife@example.com"), recipeID) {
		t.Error("an unlogged recipe should be deleted")
	}
}
