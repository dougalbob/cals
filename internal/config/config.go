package config

import (
	"os"
	"github.com/joho/godotenv"
)

type Config struct {
	Port                   string
	LogLevel               string
	DBPath                 string
	FatSecretClientID      string
	FatSecretClientSecret  string
	CFTeamDomain           string
	CFPolicyAUD            string
}

func Load() (*Config, error) {
	// Load .env file if it exists
	godotenv.Load("/app/data/.env")

	return &Config{
		Port:                   getEnv("PORT", "8150"),
		LogLevel:               getEnv("LOG_LEVEL", "info"),
		DBPath:                 getEnv("DB_PATH", "/app/data/cals.db"),
		FatSecretClientID:      getEnv("FATSECRET_CLIENT_ID", ""),
		FatSecretClientSecret:  getEnv("FATSECRET_CLIENT_SECRET", ""),
		CFTeamDomain:           getEnv("CF_TEAM_DOMAIN", ""),
		CFPolicyAUD:            getEnv("CF_POLICY_AUD", ""),
	}, nil
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
