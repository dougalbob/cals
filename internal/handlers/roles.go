package handlers

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"

	"cals/internal/auth"
	"cals/internal/database"
)

// The Admin/Standard role (product decisions 45 and 88).
//
// Cloudflare Access keeps owning authentication: it decides *who* is allowed to
// reach cals at all. The role is a separate, application-level authorization
// that decides what an authenticated person may do beyond their own account —
// today, listing accounts and swapping the acting user.
//
// The role is **declared** in configuration (ADMIN_EMAILS / STANDARD_EMAILS in
// /app/data/.env, so no personal address is hard-coded in a public repository)
// and **reconciled** into users.is_admin at start-up. Nothing else writes the
// column: config is the authority and the database is the runtime copy the
// handlers read. That keeps revocation honest — remove an address from the
// list, restart, and that person is Standard again.

// RoleConfiguration is one installation's declared role assignment.
type RoleConfiguration struct {
	Admin    []string
	Standard []string
}

// Configured reports whether any Admin has been declared. Without an Admin the
// role feature is inert and every account keeps whatever it already had.
func (c RoleConfiguration) Configured() bool { return len(c.Admin) > 0 }

func (c RoleConfiguration) IsAdmin(email string) bool { return containsEmail(c.Admin, email) }

func (c RoleConfiguration) IsStandard(email string) bool { return containsEmail(c.Standard, email) }

var (
	roleConfigMu sync.RWMutex
	roleConfig   RoleConfiguration
)

// SetConfiguredRoles records the role lists that config.Load() read from the
// environment. main.go calls it once, before the server accepts requests;
// ApplyConfiguredRoles then writes them to the database.
func SetConfiguredRoles(adminEmails, standardEmails []string) {
	roleConfigMu.Lock()
	defer roleConfigMu.Unlock()
	roleConfig = RoleConfiguration{
		Admin:    normalizeEmailList(adminEmails),
		Standard: normalizeEmailList(standardEmails),
	}
}

func configuredRoles() RoleConfiguration {
	roleConfigMu.RLock()
	defer roleConfigMu.RUnlock()
	return roleConfig
}

// IsConfiguredAdmin reports whether the declared configuration makes this email
// an Admin. Used when a brand-new account is created between restarts, so the
// Admin's very first sign-in already carries the role.
func IsConfiguredAdmin(email string) bool {
	return configuredRoles().IsAdmin(normalizeRoleEmail(email))
}

// RoleApplication is the outcome of a start-up reconciliation, shaped so the
// server can log it. A misspelled or not-yet-existing address must be visible
// in the container log rather than failing silently.
type RoleApplication struct {
	// Configured is false when no ADMIN_EMAILS list was supplied, in which
	// case the database was deliberately left untouched.
	Configured     bool
	AdminEmails    []string
	StandardEmails []string
	// Granted holds accounts promoted to Admin by this run.
	Granted []string
	// Revoked holds accounts demoted to Standard by this run because they are
	// no longer declared as Admins.
	Revoked []string
	// Missing holds declared addresses with no account yet. They keep the role
	// when they first sign in; no account is invented on their behalf.
	Missing []string
}

// ApplyConfiguredRoles reconciles users.is_admin with the declared
// configuration. It is idempotent: running it repeatedly changes nothing after
// the first pass.
func ApplyConfiguredRoles() (RoleApplication, error) {
	roles := configuredRoles()
	result := RoleApplication{
		Configured:     roles.Configured(),
		AdminEmails:    roles.Admin,
		StandardEmails: roles.Standard,
	}
	if !result.Configured {
		// The Admin capability must be opted into. An unset ADMIN_EMAILS leaves
		// every account exactly as it is instead of quietly demoting somebody.
		return result, nil
	}

	adminsBefore, err := adminEmailsInDatabase()
	if err != nil {
		return result, err
	}

	declared := append(append([]string{}, roles.Admin...), roles.Standard...)
	existing, err := existingEmails(declared)
	if err != nil {
		return result, err
	}

	if err := writeConfiguredRoles(roles.Admin); err != nil {
		return result, err
	}

	for _, email := range roles.Admin {
		switch {
		case !existing[email]:
			result.Missing = append(result.Missing, email)
		case !adminsBefore[email]:
			result.Granted = append(result.Granted, email)
		}
	}
	for _, email := range roles.Standard {
		if !existing[email] {
			result.Missing = append(result.Missing, email)
		}
	}
	for _, email := range sortedKeys(adminsBefore) {
		if !roles.IsAdmin(email) {
			result.Revoked = append(result.Revoked, email)
		}
	}

	return result, nil
}

// writeConfiguredRoles applies the two rules in one transaction: every declared
// Admin becomes an Admin, and everybody else becomes Standard. An empty Admin
// list is never passed here — callers guard on Configured().
func writeConfiguredRoles(adminEmails []string) error {
	if len(adminEmails) == 0 {
		return fmt.Errorf("refusing to reconcile roles from an empty ADMIN_EMAILS list")
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("starting role transaction: %w", err)
	}
	defer tx.Rollback()

	grantArgs := emailArgs(adminEmails)
	if _, err := tx.Exec(fmt.Sprintf(
		`UPDATE users SET is_admin = 1, updated_at = CURRENT_TIMESTAMP
		  WHERE is_admin = 0 AND email IN (%s)`, placeholders(len(adminEmails)),
	), grantArgs...); err != nil {
		return fmt.Errorf("granting admin role: %w", err)
	}

	revokeArgs := emailArgs(adminEmails)
	if _, err := tx.Exec(fmt.Sprintf(
		`UPDATE users SET is_admin = 0, updated_at = CURRENT_TIMESTAMP
		  WHERE is_admin = 1 AND email NOT IN (%s)`, placeholders(len(adminEmails)),
	), revokeArgs...); err != nil {
		return fmt.Errorf("revoking admin role: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing role changes: %w", err)
	}
	return nil
}

func adminEmailsInDatabase() (map[string]bool, error) {
	rows, err := database.DB.Query(`SELECT email FROM users WHERE is_admin = 1`)
	if err != nil {
		return nil, fmt.Errorf("reading current admins: %w", err)
	}
	defer rows.Close()

	admins := make(map[string]bool)
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return nil, fmt.Errorf("scanning admin email: %w", err)
		}
		admins[normalizeRoleEmail(email)] = true
	}
	return admins, rows.Err()
}

// existingEmails reports which of the given addresses already have an account.
// The role lists never create one: an address that has never signed in is
// simply reported as missing.
func existingEmails(emails []string) (map[string]bool, error) {
	existing := make(map[string]bool, len(emails))
	if len(emails) == 0 {
		return existing, nil
	}

	rows, err := database.DB.Query(fmt.Sprintf(
		`SELECT email FROM users WHERE email IN (%s)`, placeholders(len(emails)),
	), emailArgs(emails)...)
	if err != nil {
		return nil, fmt.Errorf("looking up configured accounts: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return nil, fmt.Errorf("scanning account email: %w", err)
		}
		existing[normalizeRoleEmail(email)] = true
	}
	return existing, rows.Err()
}

// currentUserIsAdmin reports whether the request's user holds the Admin role.
//
// Note for the acting-user switch: this must keep reading the *authenticated*
// identity, not the acting one, so that an Admin who is viewing another
// account can still list accounts and swap back.
func currentUserIsAdmin(ctx context.Context) (bool, error) {
	email := auth.GetUserEmail(ctx)
	if email == "" {
		return false, nil
	}
	user, err := GetOrCreateUser(email)
	if err != nil {
		return false, err
	}
	return user.IsAdmin, nil
}

func normalizeRoleEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func normalizeEmailList(emails []string) []string {
	normalized := make([]string, 0, len(emails))
	for _, email := range emails {
		normalized = append(normalized, normalizeRoleEmail(email))
	}
	return normalized
}

func containsEmail(emails []string, candidate string) bool {
	email := normalizeRoleEmail(candidate)
	for _, entry := range emails {
		if entry == email {
			return true
		}
	}
	return false
}

func placeholders(count int) string {
	return strings.TrimRight(strings.Repeat("?,", count), ",")
}

func emailArgs(emails []string) []any {
	args := make([]any, 0, len(emails))
	for _, email := range emails {
		args = append(args, normalizeRoleEmail(email))
	}
	return args
}

func sortedKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
