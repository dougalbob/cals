package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"cals/internal/database"
)

func TestUpdateDiaryEntryReturnsJSONContentType(t *testing.T) {
	setupHandlerDB(t)
	userID := createTestUser(t, "wife@example.com", "2026-10-01", 1500)
	foodID := createTestFood(t)

	result, err := database.DB.Exec(`
		INSERT INTO diary_entries (user_id, date, meal, food_id, quantity_grams, calories)
		VALUES (?, '2026-10-02', 'breakfast', ?, 75, 335.25)
	`, userID, foodID)
	if err != nil {
		t.Fatalf("inserting diary entry: %v", err)
	}
	entryID, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("reading diary entry ID: %v", err)
	}

	req := authedRequest(t, http.MethodPut, "/api/diary/"+itoa(entryID),
		`{"quantity_grams":25,"calories":111.75}`, "wife@example.com")
	req.SetPathValue("id", itoa(entryID))
	recorder := httptest.NewRecorder()

	HandleUpdateDiaryEntry(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want %q", got, "application/json")
	}

	var response struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if !response.Success {
		t.Errorf("response = %+v, want success=true", response)
	}
}
