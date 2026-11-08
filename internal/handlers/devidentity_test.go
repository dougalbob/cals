package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"cals/internal/auth"
	"cals/internal/database"
)

// setupDevIdentityDB opens a throwaway SQLite file for the dev-identity tests.
// A file (rather than :memory:) keeps go-sqlite3's connection pool from
// creating independent empty databases.
func setupDevIdentityDB(t *testing.T) {
	t.Helper()
	database.Close()
	if err := database.Initialize(filepath.Join(t.TempDir(), "test.db")); err != nil {
		t.Fatalf("database.Initialize() error = %v", err)
	}
	t.Cleanup(database.Close)
}

func TestUserExistsByEmailOnlyMatchesExistingUsers(t *testing.T) {
	setupDevIdentityDB(t)

	if _, err := database.DB.Exec(`INSERT INTO users (email, name) VALUES (?, ?), (?, ?)`,
		"husband@example.com", "Husband", "wife@example.com", "Wife"); err != nil {
		t.Fatalf("inserting users: %v", err)
	}

	for _, tc := range []struct {
		email string
		want  bool
	}{
		{"wife@example.com", true},
		{"WIFE@Example.com", true},
		{"ghost@example.com", false},
	} {
		got, err := UserExistsByEmail(tc.email)
		if err != nil {
			t.Fatalf("UserExistsByEmail(%q) error = %v", tc.email, err)
		}
		if got != tc.want {
			t.Errorf("UserExistsByEmail(%q) = %v, want %v", tc.email, got, tc.want)
		}
	}

	// The lookup must never create a user.
	var count int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		t.Fatalf("counting users: %v", err)
	}
	if count != 2 {
		t.Errorf("user count = %d, want 2 (the switch must not create users)", count)
	}
}

func TestHandleDevIdentityPageExplainsWhenDatabaseHasNoUsers(t *testing.T) {
	setupDevIdentityDB(t)

	req := httptest.NewRequest(http.MethodGet, "/dev/identity", nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.UserEmailKey, "default@example.com"))
	recorder := httptest.NewRecorder()

	HandleDevIdentityPage(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	body := recorder.Body.String()
	for _, want := range []string{
		"No users found in this database.",
		"never creates them",
		"disposable copy",
		"href=\"/\">Open cals</a>",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("empty-state page does not contain %q", want)
		}
	}
}

func TestHandleDevIdentityPageListsUsersAndMarksCurrent(t *testing.T) {
	setupDevIdentityDB(t)

	if _, err := database.DB.Exec(`INSERT INTO users (email, name) VALUES (?, ?), (?, ?)`,
		"husband@example.com", "Husband", "wife@example.com", "Wife"); err != nil {
		t.Fatalf("inserting users: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/dev/identity", nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.UserEmailKey, "wife@example.com"))
	recorder := httptest.NewRecorder()

	HandleDevIdentityPage(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got, want := recorder.Header().Get("Cache-Control"), "no-store"; got != want {
		t.Errorf("Cache-Control = %q, want %q", got, want)
	}

	body := recorder.Body.String()
	for _, want := range []string{
		"wife@example.com",
		"husband@example.com",
		"?as=husband%40example.com",
		"?as=",
		"current",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("page does not contain %q", want)
		}
	}
	if strings.Contains(body, "ghost@example.com") {
		t.Error("page should only list existing users")
	}
}
