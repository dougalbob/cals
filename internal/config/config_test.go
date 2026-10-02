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
