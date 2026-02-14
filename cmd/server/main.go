package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"cals/internal/auth"
	"cals/internal/config"
	"cals/internal/database"
	"cals/internal/handlers"
)

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

	// Initialize Cloudflare auth
	cfAuth := auth.NewCloudflareAuth(cfg.CFTeamDomain, cfg.CFPolicyAUD)

	// Create router
	mux := http.NewServeMux()

	// Health check (unprotected)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Public files - unprotected (for PWA install)
	publicFS := http.FileServer(http.Dir("web/public"))
	mux.Handle("GET /public/", http.StripPrefix("/public/", publicFS))

	// Static files
	staticFS := http.FileServer(http.Dir("web/static"))
	mux.Handle("GET /static/", http.StripPrefix("/static/", staticFS))

	// API routes (protected)
	mux.Handle("GET /api/users/me", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetCurrentUser)))
	mux.Handle("PUT /api/users/me", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUpdateCurrentUser)))
	mux.Handle("GET /api/users", cfAuth.Middleware(http.HandlerFunc(handlers.HandleListUsers)))

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
	log.Printf("Starting server on port %s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
		os.Exit(1)
	}
}
