package config

import (
	"strings"
	"testing"
)

func setDevConfigEnv(t *testing.T, devMode, devUserEmail, bindAddress string) {
	t.Helper()
	t.Setenv("DEV_MODE", devMode)
	t.Setenv("DEV_USER_EMAIL", devUserEmail)
	t.Setenv("BIND_ADDRESS", bindAddress)
	t.Setenv("PORT", "8150")
}

func TestLoadKeepsProductionDefaultsWhenDevModeIsUnset(t *testing.T) {
	setDevConfigEnv(t, "", "", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.DevMode {
		t.Fatal("DevMode = true, want false")
	}
	if cfg.BindAddress != "" {
		t.Errorf("BindAddress = %q, want empty production default", cfg.BindAddress)
	}
	if got, want := cfg.ListenAddress(), ":8150"; got != want {
		t.Errorf("ListenAddress() = %q, want %q", got, want)
	}
}

func TestLoadDevModeUsesLoopbackDefaultAndNormalizesEmail(t *testing.T) {
	setDevConfigEnv(t, "true", "  USER@Example.COM  ", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !cfg.DevMode {
		t.Fatal("DevMode = false, want true")
	}
	if got, want := cfg.DevUserEmail, "user@example.com"; got != want {
		t.Errorf("DevUserEmail = %q, want %q", got, want)
	}
	if got, want := cfg.BindAddress, "127.0.0.1"; got != want {
		t.Errorf("BindAddress = %q, want %q", got, want)
	}
	if got, want := cfg.ListenAddress(), "127.0.0.1:8150"; got != want {
		t.Errorf("ListenAddress() = %q, want %q", got, want)
	}
}

func TestLoadDevModeRequiresAValidEmail(t *testing.T) {
	for _, email := range []string{"", "not-an-email", "Name <user@example.com>"} {
		t.Run(email, func(t *testing.T) {
			setDevConfigEnv(t, "true", email, "")
			if _, err := Load(); err == nil || !strings.Contains(err.Error(), "DEV_USER_EMAIL") {
				t.Fatalf("Load() error = %v, want DEV_USER_EMAIL validation error", err)
			}
		})
	}
}

func TestLoadDevModeRejectsUnsafeBindAddresses(t *testing.T) {
	for _, address := range []string{"0.0.0.0", "::", "8.8.8.8", "203.0.113.5", "localhost"} {
		t.Run(address, func(t *testing.T) {
			setDevConfigEnv(t, "true", "user@example.com", address)
			if _, err := Load(); err == nil || !strings.Contains(err.Error(), "BIND_ADDRESS") {
				t.Fatalf("Load() error = %v, want BIND_ADDRESS validation error", err)
			}
		})
	}
}

func TestLoadDevModeAllowsLoopbackAndPrivateBindAddresses(t *testing.T) {
	for _, address := range []string{"127.0.0.1", "10.1.2.3", "172.16.0.10", "192.168.1.2", "::1", "fd00::1"} {
		t.Run(address, func(t *testing.T) {
			setDevConfigEnv(t, "true", "user@example.com", address)
			cfg, err := Load()
			if err != nil {
				t.Fatalf("Load() error = %v", err)
			}
			if cfg.BindAddress != address {
				t.Errorf("BindAddress = %q, want %q", cfg.BindAddress, address)
			}
		})
	}
}

func TestLoadRejectsInvalidDevModeValue(t *testing.T) {
	setDevConfigEnv(t, "sometimes", "user@example.com", "")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "DEV_MODE") {
		t.Fatalf("Load() error = %v, want DEV_MODE validation error", err)
	}
}

func TestLoadIdentitySwitchDefaultsOffInDevMode(t *testing.T) {
	setDevConfigEnv(t, "true", "user@example.com", "192.168.1.2")
	t.Setenv("DEV_IDENTITY_SWITCH", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.DevIdentitySwitch {
		t.Error("DevIdentitySwitch = true, want false by default")
	}
}

func TestLoadAllowsIdentitySwitchOnlyWithDevMode(t *testing.T) {
	setDevConfigEnv(t, "true", "user@example.com", "192.168.1.2")
	t.Setenv("DEV_IDENTITY_SWITCH", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !cfg.DevIdentitySwitch {
		t.Error("DevIdentitySwitch = false, want true")
	}
}

func TestLoadRejectsIdentitySwitchWithoutDevMode(t *testing.T) {
	// This is the guard that keeps the switch away from a Cloudflare-routed
	// deployment: DEV_MODE must be on first, and DEV_MODE itself requires a
	// loopback/private bind.
	setDevConfigEnv(t, "", "", "")
	t.Setenv("DEV_IDENTITY_SWITCH", "true")

	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "DEV_IDENTITY_SWITCH") {
		t.Fatalf("Load() error = %v, want DEV_IDENTITY_SWITCH validation error", err)
	}
}

func TestLoadRejectsInvalidIdentitySwitchValue(t *testing.T) {
	setDevConfigEnv(t, "true", "user@example.com", "")
	t.Setenv("DEV_IDENTITY_SWITCH", "sometimes")

	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "DEV_IDENTITY_SWITCH") {
		t.Fatalf("Load() error = %v, want DEV_IDENTITY_SWITCH validation error", err)
	}
}

func setRoleConfigEnv(t *testing.T, adminEmails, standardEmails string) {
	t.Helper()
	setDevConfigEnv(t, "", "", "")
	t.Setenv("ADMIN_EMAILS", adminEmails)
	t.Setenv("STANDARD_EMAILS", standardEmails)
}

func TestLoadParsesDeclaredRoleEmails(t *testing.T) {
	setRoleConfigEnv(t, "  Owner@Example.COM , second@example.com, ", "wife@example.com")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	// Lower-cased and trimmed, because every identity the app sees (Cloudflare
	// JWT, DEV_USER_EMAIL) is lower-cased before it is compared.
	if got, want := cfg.AdminEmails, []string{"owner@example.com", "second@example.com"}; !equalEmails(got, want) {
		t.Errorf("AdminEmails = %v, want %v", got, want)
	}
	if got, want := cfg.StandardEmails, []string{"wife@example.com"}; !equalEmails(got, want) {
		t.Errorf("StandardEmails = %v, want %v", got, want)
	}
}

func TestLoadLeavesRolesUndeclaredWhenUnset(t *testing.T) {
	setRoleConfigEnv(t, "", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if len(cfg.AdminEmails) != 0 || len(cfg.StandardEmails) != 0 {
		t.Errorf("roles = admin %v / standard %v, want both empty when unset", cfg.AdminEmails, cfg.StandardEmails)
	}
}

func TestLoadRejectsMalformedRoleEmails(t *testing.T) {
	tests := map[string]string{
		"not an address":   "not-an-email",
		"display name":     "Owner <owner@example.com>",
		"trailing garbage": "owner@example.com, nope",
	}
	for name, value := range tests {
		t.Run(name, func(t *testing.T) {
			setRoleConfigEnv(t, value, "wife@example.com")
			if _, err := Load(); err == nil || !strings.Contains(err.Error(), "ADMIN_EMAILS") {
				t.Fatalf("Load() error = %v, want an ADMIN_EMAILS validation error", err)
			}
		})
	}
}

func TestLoadRejectsAnEmailDeclaredAsBothRoles(t *testing.T) {
	setRoleConfigEnv(t, "owner@example.com", "owner@example.com, wife@example.com")

	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil, want a conflict error")
	}
	if !strings.Contains(err.Error(), "owner@example.com") || !strings.Contains(err.Error(), "both") {
		t.Errorf("Load() error = %v, want it to name the conflicting address", err)
	}
}

func equalEmails(got, want []string) bool {
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
