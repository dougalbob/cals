package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"cals/internal/database"
	"cals/internal/models"
)

func getLatestWeightEntry(t *testing.T, email string) (int, *models.WeightEntry) {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleGetLatestWeightEntry(recorder, authedRequest(t, http.MethodGet, "/api/weight/latest", "", email))
	if recorder.Code != http.StatusOK {
		return recorder.Code, nil
	}
	var entry *models.WeightEntry
	if err := json.NewDecoder(recorder.Body).Decode(&entry); err != nil {
		t.Fatalf("decoding latest weigh-in: %v", err)
	}
	return recorder.Code, entry
}

func TestLatestWeightEntryReadsAllHistoryForCurrentUser(t *testing.T) {
	setupHandlerDB(t)
	ownerID := createTestUser(t, "owner@example.com", "2025-01-01", 2000)
	otherID := createTestUser(t, "other@example.com", "2025-01-01", 1800)

	for _, entry := range []struct {
		userID int64
		date   string
		kg     float64
	}{
		{userID: ownerID, date: "2024-03-12", kg: 91.2},
		{userID: ownerID, date: "2026-01-07", kg: 84.6},
		{userID: otherID, date: "2026-10-06", kg: 72.1},
	} {
		if _, err := database.DB.Exec(`
			INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, ?, ?)
		`, entry.userID, entry.date, entry.kg); err != nil {
			t.Fatalf("inserting weigh-in: %v", err)
		}
	}

	status, latest := getLatestWeightEntry(t, "owner@example.com")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	if latest == nil {
		t.Fatal("latest weigh-in is null")
	}
	if latest.Date != "2026-01-07" || latest.WeightKG != 84.6 {
		t.Errorf("latest = %+v, want the owner's newest all-time row 2026-01-07 / 84.6 kg", latest)
	}
}

func TestLatestWeightEntryReturnsNullWhenNoWeighInsExist(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "empty@example.com", "2025-01-01", 2000)

	status, latest := getLatestWeightEntry(t, "empty@example.com")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	if latest != nil {
		t.Errorf("latest = %+v, want null", latest)
	}
}
