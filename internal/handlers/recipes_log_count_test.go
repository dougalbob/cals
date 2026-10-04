package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRecipeLogCountIsPerUserAndIncludesArchivedHistory(t *testing.T) {
	setupHandlerDB(t)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	createTestUser(t, "husband@example.com", "2026-09-28", 2000)
	loggedRecipeID := createTestRecipe(t, "Chicken Curry", wifeID)
	neverLoggedRecipeID := createTestRecipe(t, "New Recipe", wifeID)

	for i := 0; i < 2; i++ {
		if recorder := logRecipeForTest(t, loggedRecipeID, 350, false, "dinner", "wife@example.com"); recorder.Code != http.StatusCreated {
			t.Fatalf("wife log %d status = %d, body = %s", i+1, recorder.Code, recorder.Body.String())
		}
	}
	if recorder := logRecipeForTest(t, loggedRecipeID, 450, false, "lunch", "husband@example.com"); recorder.Code != http.StatusCreated {
		t.Fatalf("husband log status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	wifeList := listRecipesForTest(t, "wife@example.com")
	if got := findRecipe(t, wifeList, loggedRecipeID).TimesLogged; got != 2 {
		t.Errorf("wife list times_logged = %d, want 2", got)
	}
	if got := findRecipe(t, wifeList, neverLoggedRecipeID).TimesLogged; got != 0 {
		t.Errorf("never-logged recipe times_logged = %d, want 0", got)
	}

	husbandList := listRecipesForTest(t, "husband@example.com")
	if got := findRecipe(t, husbandList, loggedRecipeID).TimesLogged; got != 1 {
		t.Errorf("husband list times_logged = %d, want 1", got)
	}
	if got := getRecipeForTest(t, loggedRecipeID, "wife@example.com").TimesLogged; got != 2 {
		t.Errorf("wife detail times_logged = %d, want 2", got)
	}
	if got := getRecipeForTest(t, loggedRecipeID, "husband@example.com").TimesLogged; got != 1 {
		t.Errorf("husband detail times_logged = %d, want 1", got)
	}

	// Even a zero must be present in the additive API field so clients can
	// distinguish the contract from an older response; the UI hides the badge.
	recorder := httptest.NewRecorder()
	HandleListRecipes(recorder, authedRequest(t, http.MethodGet, "/api/recipes", "", "wife@example.com"))
	var response []map[string]json.RawMessage
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decoding recipe list JSON: %v", err)
	}
	var zeroCount json.RawMessage
	for _, recipe := range response {
		var id int64
		if err := json.Unmarshal(recipe["id"], &id); err != nil {
			t.Fatalf("decoding recipe id: %v", err)
		}
		if id == neverLoggedRecipeID {
			zeroCount = recipe["times_logged"]
			break
		}
	}
	if string(zeroCount) != "0" {
		t.Errorf("zero-count response field = %s, want 0", zeroCount)
	}

	if recorder := setRecipeArchivedForTest(t, loggedRecipeID, "wife@example.com", true); recorder.Code != http.StatusOK {
		t.Fatalf("archiving recipe status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if containsRecipe(listRecipesForTest(t, "wife@example.com"), loggedRecipeID) {
		t.Error("archived recipe should stay hidden from the default list")
	}
	archived := findRecipe(t, listRecipesIncludingArchivedForTest(t, "wife@example.com"), loggedRecipeID)
	if archived.TimesLogged != 2 {
		t.Errorf("archived recipe times_logged = %d, want its two saved diary rows", archived.TimesLogged)
	}
	if got := getRecipeForTest(t, loggedRecipeID, "wife@example.com").TimesLogged; got != 2 {
		t.Errorf("archived recipe detail times_logged = %d, want 2", got)
	}
}
