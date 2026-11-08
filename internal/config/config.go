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
	// AdminEmails and StandardEmails are the declared Admin/Standard roles for
	// this installation (decisions 45 and 88). They come from the environment
	// — normally /app/data/.env — so no personal email address is hard-coded
	// in the public repository. They are reconciled into users.is_admin at
	// start-up; see internal/handlers/roles.go.
	AdminEmails    []string
	StandardEmails []string
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

	adminEmails, err := parseEmailList(getEnv("ADMIN_EMAILS", ""))
	if err != nil {
		return nil, fmt.Errorf("invalid ADMIN_EMAILS: %w", err)
	}
	standardEmails, err := parseEmailList(getEnv("STANDARD_EMAILS", ""))
	if err != nil {
		return nil, fmt.Errorf("invalid STANDARD_EMAILS: %w", err)
	}
	if both := emailsInBoth(adminEmails, standardEmails); len(both) > 0 {
		return nil, fmt.Errorf(
			"these emails are listed as both Admin and Standard: %s (an account can only hold one role)",
			strings.Join(both, ", "),
		)
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
		AdminEmails:           adminEmails,
		StandardEmails:        standardEmails,
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

// parseEmailList reads a comma-separated list of email addresses from one
// configuration value. Blank entries are skipped so a trailing comma — or an
// unset value, meaning "no role declared" — is not an error. Addresses are
// lower-cased and de-duplicated because the app lower-cases every identity it
// sees (the Cloudflare JWT email and DEV_USER_EMAIL alike), and a
// differently-cased duplicate would silently fail to match later.
func parseEmailList(value string) ([]string, error) {
	var emails []string
	seen := make(map[string]bool)

	for _, entry := range strings.Split(value, ",") {
		email := strings.ToLower(strings.TrimSpace(entry))
		if email == "" {
			continue
		}
		address, err := mail.ParseAddress(email)
		if err != nil || address.Address != email {
			return nil, fmt.Errorf("%q is not a valid email address", strings.TrimSpace(entry))
		}
		if seen[email] {
			continue
		}
		seen[email] = true
		emails = append(emails, email)
	}

	return emails, nil
}

// emailsInBoth returns the emails that appear in both lists, preserving the
// order of the first. An address can only hold one role, so the overlap is a
// configuration error rather than something to resolve silently.
func emailsInBoth(first, second []string) []string {
	inSecond := make(map[string]bool, len(second))
	for _, email := range second {
		inSecond[email] = true
	}

	var overlap []string
	for _, email := range first {
		if inSecond[email] {
			overlap = append(overlap, email)
		}
	}
	return overlap
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
