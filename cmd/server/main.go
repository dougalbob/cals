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

const AppVersion = "1.4.1"

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if err := database.Initialize(cfg.DBPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	if cfg.FatSecretClientID != "" && cfg.FatSecretClientSecret != "" {
		handlers.FatSecretClient = fatsecret.NewClient(cfg.FatSecretClientID, cfg.FatSecretClientSecret)
		log.Println("FatSecret client initialized")
	} else {
		log.Println("Warning: FatSecret credentials not configured")
	}

	cfAuth := auth.NewCloudflareAuth(cfg.CFTeamDomain, cfg.CFPolicyAUD)

	mux := http.NewServeMux()

	// Health check (unprotected)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Version endpoint (unprotected)
	mux.HandleFunc("GET /api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Write([]byte(`{"version":"` + AppVersion + `"}`))
	})

	// Debug endpoint (temporary)
	mux.HandleFunc("GET /api/debug/fatsecret", handlers.HandleTestFatSecret)

	// Public files (unprotected - PWA assets)
	publicFS := http.FileServer(http.Dir("web/public"))
	mux.Handle("GET /public/", http.StripPrefix("/public/", publicFS))

	// Static files with no-cache for JS
	mux.HandleFunc("GET /static/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".js") {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
		}
		http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))).ServeHTTP(w, r)
	})

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

	// Diary
	mux.Handle("GET /api/diary", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetDiary)))
	mux.Handle("GET /api/diary/range", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetDiaryRange)))
	mux.Handle("POST /api/diary", cfAuth.Middleware(http.HandlerFunc(handlers.HandleCreateDiaryEntry)))
	mux.Handle("PUT /api/diary/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUpdateDiaryEntry)))
	mux.Handle("DELETE /api/diary/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleDeleteDiaryEntry)))

	// Bank
	mux.Handle("GET /api/bank", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetBank)))

	// Recipes
	mux.Handle("GET /api/recipes", cfAuth.Middleware(http.HandlerFunc(handlers.HandleListRecipes)))
	mux.Handle("GET /api/recipes/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetRecipe)))
	mux.Handle("POST /api/recipes", cfAuth.Middleware(http.HandlerFunc(handlers.HandleCreateRecipe)))
	mux.Handle("PUT /api/recipes/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUpdateRecipe)))
	mux.Handle("DELETE /api/recipes/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleDeleteRecipe)))

	// Recipe images
	mux.Handle("POST /api/recipes/{id}/image", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUploadRecipeImage)))
	mux.Handle("GET /api/images/recipes/{id}/{type}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetRecipeImage)))

	// Index page - catch all for SPA
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, "web/templates/index.html")
	})

	log.Printf("Starting Cals v%s on port %s", AppVersion, cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
		os.Exit(1)
	}
}
