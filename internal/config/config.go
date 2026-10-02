package config

import (
	"fmt"
	"net"
	"net/mail"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                  string
	LogLevel              string
	DBPath                string
	FatSecretClientID     string
	FatSecretClientSecret string
	CFTeamDomain          string
	CFPolicyAUD           string
	MealieBaseURL         string
	MealieAPIKey          string
	DevMode               bool
	DevUserEmail          string
	DevIdentitySwitch     bool
	BindAddress           string
}

func Load() (*Config, error) {
	// Load .env file if it exists. Environment variables still take precedence.
	_ = godotenv.Load("/app/data/.env")

	devModeValue := strings.TrimSpace(getEnv("DEV_MODE", ""))
	devMode := false
	if devModeValue != "" {
		parsed, err := strconv.ParseBool(devModeValue)
		if err != nil {
			return nil, fmt.Errorf("invalid DEV_MODE value %q: use true or false", devModeValue)
		}
		devMode = parsed
	}

	devIdentitySwitchValue := strings.TrimSpace(getEnv("DEV_IDENTITY_SWITCH", ""))
	devIdentitySwitch := false
	if devIdentitySwitchValue != "" {
		parsed, err := strconv.ParseBool(devIdentitySwitchValue)
		if err != nil {
			return nil, fmt.Errorf("invalid DEV_IDENTITY_SWITCH value %q: use true or false", devIdentitySwitchValue)
		}
		devIdentitySwitch = parsed
	}
	if devIdentitySwitch && !devMode {
		return nil, fmt.Errorf("DEV_IDENTITY_SWITCH=true requires DEV_MODE=true: the identity switch is a development-only feature and must never be enabled on a Cloudflare-routed deployment")
	}

	devUserEmail := strings.ToLower(strings.TrimSpace(getEnv("DEV_USER_EMAIL", "")))
	bindAddress := strings.TrimSpace(getEnv("BIND_ADDRESS", ""))
	if devMode {
		if err := validateDevUserEmail(devUserEmail); err != nil {
			return nil, err
		}
		if bindAddress == "" {
			// A safe local-only default. A non-loopback address must be opted into
			// explicitly and is still restricted to private IPs below.
			bindAddress = "127.0.0.1"
		}
		if err := validateDevBindAddress(bindAddress); err != nil {
			return nil, err
		}
	}

	return &Config{
		Port:                  getEnv("PORT", "8150"),
		LogLevel:              getEnv("LOG_LEVEL", "info"),
		DBPath:                getEnv("DB_PATH", "/app/data/cals.db"),
		FatSecretClientID:     getEnv("FATSECRET_CLIENT_ID", ""),
		FatSecretClientSecret: getEnv("FATSECRET_CLIENT_SECRET", ""),
		CFTeamDomain:          getEnv("CF_TEAM_DOMAIN", ""),
		CFPolicyAUD:           getEnv("CF_POLICY_AUD", ""),
		MealieBaseURL:         getEnv("MEALIE_BASE_URL", ""),
		MealieAPIKey:          getEnv("MEALIE_API_KEY", ""),
		DevMode:               devMode,
		DevUserEmail:          devUserEmail,
		DevIdentitySwitch:     devIdentitySwitch,
		BindAddress:           bindAddress,
	}, nil
}

// ListenAddress returns the net/http listener address. An empty BindAddress
// deliberately preserves the production default of listening on all interfaces.
func (c *Config) ListenAddress() string {
	if c.BindAddress == "" {
		return ":" + c.Port
	}
	return net.JoinHostPort(c.BindAddress, c.Port)
}

func validateDevUserEmail(email string) error {
	if email == "" {
		return fmt.Errorf("DEV_USER_EMAIL is required when DEV_MODE=true")
	}

	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email {
		return fmt.Errorf("DEV_USER_EMAIL must be a valid email address when DEV_MODE=true")
	}
	return nil
}

func validateDevBindAddress(address string) error {
	ip := net.ParseIP(address)
	if ip == nil || (!ip.IsLoopback() && !ip.IsPrivate()) {
		return fmt.Errorf("DEV_MODE requires BIND_ADDRESS to be a loopback or private IP address (got %q); use 127.0.0.1 for local-only development", address)
	}
	return nil
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
