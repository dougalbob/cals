package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"cals/internal/auth"
	"cals/internal/config"
	"cals/internal/database"
	"cals/internal/fatsecret"
	"cals/internal/handlers"
)

const AppVersion = "1.1.0"

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize database
	if err := database.Initialize(cfg.DBPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Initialize FatSecret client
	if cfg.FatSecretClientID != "" && cfg.FatSecretClientSecret != "" {
		handlers.FatSecretClient = fatsecret.NewClient(cfg.FatSecretClientID, cfg.FatSecretClientSecret)
		log.Println("FatSecret client initialized")
	} else {
		log.Println("Warning: FatSecret credentials not configured - check FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET in .env")
	}

	// Initialize Cloudflare auth
	cfAuth := auth.NewCloudflareAuth(cfg.CFTeamDomain, cfg.CFPolicyAUD)

	// Create router
	mux := http.NewServeMux()

	// Health check (unprotected)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Version endpoint (unprotected)
	mux.HandleFunc("GET /api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"version":"` + AppVersion + `"}`))
	})

	// Debug endpoint (temporary - remove after testing)
	mux.HandleFunc("GET /api/debug/fatsecret", handlers.HandleTestFatSecret)

	// Public files - unprotected (for PWA install)
	publicFS := http.FileServer(http.Dir("web/public"))
	mux.Handle("GET /public/", http.StripPrefix("/public/", publicFS))

	// Static files
	staticFS := http.FileServer(http.Dir("web/static"))
	mux.Handle("GET /static/", http.StripPrefix("/static/", staticFS))

	// API routes (protected)
	// Users
	mux.Handle("GET /api/users/me", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetCurrentUser)))
	mux.Handle("PUT /api/users/me", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUpdateCurrentUser)))
	mux.Handle("GET /api/users", cfAuth.Middleware(http.HandlerFunc(handlers.HandleListUsers)))

	// Foods
	mux.Handle("GET /api/foods/search", cfAuth.Middleware(http.HandlerFunc(handlers.HandleSearchFoods)))
	mux.Handle("GET /api/foods/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetFood)))
	mux.Handle("PUT /api/foods/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUpdateFood)))
	mux.Handle("POST /api/foods", cfAuth.Middleware(http.HandlerFunc(handlers.HandleCreateFood)))

	// Index page - catch all for SPA
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Don't serve index.html for /api/ routes that weren't matched
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, "web/templates/index.html")
	})

	// Start server
	log.Printf("Starting Cals v%s on port %s", AppVersion, cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
		os.Exit(1)
	}
}
