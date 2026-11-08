package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"cals/internal/database"
)

// setTestRoles points the package-level role configuration at the given lists
// and restores the unset default afterwards, so one test cannot leak a declared
// Admin into another.
func setTestRoles(t *testing.T, admin, standard []string) {
	t.Helper()
	previous := roleConfig
	t.Cleanup(func() { roleConfig = previous })
	SetConfiguredRoles(admin, standard)
}

func isAdminInDatabase(t *testing.T, email string) bool {
	t.Helper()
	var isAdmin bool
	if err := database.DB.QueryRow(`SELECT is_admin FROM users WHERE email = ?`, email).Scan(&isAdmin); err != nil {
		t.Fatalf("reading is_admin for %s: %v", email, err)
	}
	return isAdmin
}

func countUsers(t *testing.T) int {
	t.Helper()
	var count int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		t.Fatalf("counting users: %v", err)
	}
	return count
}

// The declared configuration is the authority: it grants the Admin role at
// start-up and leaves everybody else Standard.
func TestApplyConfiguredRolesGrantsAdminAndStandard(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	createTestUser(t, "wife@example.com", "2026-09-01", 1500)

	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	applied, err := ApplyConfiguredRoles()
	if err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	if !applied.Configured {
		t.Fatal("Configured = false, want true once ADMIN_EMAILS is supplied")
	}
	if !isAdminInDatabase(t, "owner@example.com") {
		t.Error("owner is_admin = false, want true (declared in ADMIN_EMAILS)")
	}
	if isAdminInDatabase(t, "wife@example.com") {
		t.Error("wife is_admin = true, want false (declared in STANDARD_EMAILS)")
	}
	if got, want := applied.Granted, []string{"owner@example.com"}; !sameEmails(got, want) {
		t.Errorf("Granted = %v, want %v", got, want)
	}
	if len(applied.Revoked) != 0 {
		t.Errorf("Revoked = %v, want empty on a first run", applied.Revoked)
	}
	if len(applied.Missing) != 0 {
		t.Errorf("Missing = %v, want empty when both accounts exist", applied.Missing)
	}
}

// Revocation is the whole point of keeping the lists in configuration:
// removing an address from ADMIN_EMAILS demotes that account on the next
// start-up, so appdata stays the off-switch.
func TestApplyConfiguredRolesRevokesAnAdminWhoIsNoLongerDeclared(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	createTestUser(t, "wife@example.com", "2026-09-01", 1500)

	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("first ApplyConfiguredRoles() error = %v", err)
	}

	setTestRoles(t, []string{"wife@example.com"}, []string{"owner@example.com"})
	applied, err := ApplyConfiguredRoles()
	if err != nil {
		t.Fatalf("second ApplyConfiguredRoles() error = %v", err)
	}

	if isAdminInDatabase(t, "owner@example.com") {
		t.Error("owner is_admin = true after removal from ADMIN_EMAILS, want false")
	}
	if !isAdminInDatabase(t, "wife@example.com") {
		t.Error("wife is_admin = false after promotion, want true")
	}
	if got, want := applied.Granted, []string{"wife@example.com"}; !sameEmails(got, want) {
		t.Errorf("Granted = %v, want %v", got, want)
	}
	if got, want := applied.Revoked, []string{"owner@example.com"}; !sameEmails(got, want) {
		t.Errorf("Revoked = %v, want %v", got, want)
	}
}

// Without an Admin the feature must be inert: an existing installation that
// has never declared roles keeps behaving exactly as it does today.
func TestApplyConfiguredRolesIsInertWhenNoAdminIsDeclared(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	if _, err := database.DB.Exec(`UPDATE users SET is_admin = 1 WHERE email = 'owner@example.com'`); err != nil {
		t.Fatalf("seeding an admin: %v", err)
	}

	setTestRoles(t, nil, []string{"wife@example.com"})
	applied, err := ApplyConfiguredRoles()
	if err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	if applied.Configured {
		t.Error("Configured = true with an empty ADMIN_EMAILS, want false")
	}
	if !isAdminInDatabase(t, "owner@example.com") {
		t.Error("an unconfigured run changed is_admin; the database must be left alone")
	}
}

// A configured address is reported, never created: inventing an account for a
// typo would put a stranger in the household's user list.
func TestApplyConfiguredRolesReportsMissingAccountsWithoutCreatingThem(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-01", 1500)

	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com", "typo@example.com"})
	applied, err := ApplyConfiguredRoles()
	if err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	if got, want := applied.Missing, []string{"owner@example.com", "typo@example.com"}; !sameEmails(got, want) {
		t.Errorf("Missing = %v, want %v", got, want)
	}
	if got, want := countUsers(t), 1; got != want {
		t.Errorf("user count = %d, want %d: the role lists must not create accounts", got, want)
	}
}

// Configuration is lower-cased; a differently-cased address must still match
// the account Cloudflare created.
func TestApplyConfiguredRolesMatchesEmailsCaseInsensitively(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)

	setTestRoles(t, []string{"  Owner@Example.COM  "}, nil)
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	if !isAdminInDatabase(t, "owner@example.com") {
		t.Error("owner is_admin = false, want true: declared addresses are matched case-insensitively")
	}
}

// A brand-new account takes its declared role on first sign-in rather than
// waiting for the next restart, so a fresh database works immediately.
func TestNewAccountTakesItsDeclaredRoleOnCreation(t *testing.T) {
	setupHandlerDB(t)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})

	owner, err := GetOrCreateUser("owner@example.com")
	if err != nil {
		t.Fatalf("GetOrCreateUser(owner) error = %v", err)
	}
	if !owner.IsAdmin {
		t.Error("new owner account IsAdmin = false, want true (declared Admin)")
	}

	wife, err := GetOrCreateUser("wife@example.com")
	if err != nil {
		t.Fatalf("GetOrCreateUser(wife) error = %v", err)
	}
	if wife.IsAdmin {
		t.Error("new wife account IsAdmin = true, want false (declared Standard)")
	}

	// Reading the account back must agree with what was stored.
	reloaded, err := GetOrCreateUser("owner@example.com")
	if err != nil {
		t.Fatalf("reloading owner: %v", err)
	}
	if !reloaded.IsAdmin {
		t.Error("reloaded owner IsAdmin = false, want the stored role")
	}
}

// GET /api/users is the account list an Admin swaps between. It was answering
// any authenticated request before this change (decisions 45 and 88).
func TestListUsersIsAdminOnly(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	adminRecorder := httptest.NewRecorder()
	HandleListUsers(adminRecorder, authedRequest(t, http.MethodGet, "/api/users", "", "owner@example.com"))
	if adminRecorder.Code != http.StatusOK {
		t.Fatalf("GET /api/users as admin status = %d, want 200 (body %s)", adminRecorder.Code, adminRecorder.Body.String())
	}
	var listed []struct {
		Email   string `json:"email"`
		IsAdmin bool   `json:"is_admin"`
	}
	if err := json.NewDecoder(adminRecorder.Body).Decode(&listed); err != nil {
		t.Fatalf("decoding user list: %v", err)
	}
	if len(listed) != 2 {
		t.Fatalf("user list length = %d, want 2", len(listed))
	}
	for _, user := range listed {
		if user.Email == "owner@example.com" && !user.IsAdmin {
			t.Error("listed owner is_admin = false, want the role to be visible to the client")
		}
		if user.Email == "wife@example.com" && user.IsAdmin {
			t.Error("listed wife is_admin = true, want false")
		}
	}

	standardRecorder := httptest.NewRecorder()
	HandleListUsers(standardRecorder, authedRequest(t, http.MethodGet, "/api/users", "", "wife@example.com"))
	if standardRecorder.Code != http.StatusForbidden {
		t.Errorf("GET /api/users as a standard user status = %d, want 403", standardRecorder.Code)
	}
}

// An installation with no declared roles has no Admin, so the account list
// stays closed to everybody rather than opening up.
func TestListUsersIsForbiddenWhenNoAdminIsDeclared(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, nil, nil)

	recorder := httptest.NewRecorder()
	HandleListUsers(recorder, authedRequest(t, http.MethodGet, "/api/users", "", "wife@example.com"))
	if recorder.Code != http.StatusForbidden {
		t.Errorf("GET /api/users status = %d, want 403 when no Admin is declared", recorder.Code)
	}
}

func sameEmails(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range want {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
