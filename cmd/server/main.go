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

const AppVersion = "1.7.0"

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

	// Initialize Google Fit
	handlers.InitFitness()
	if os.Getenv("GOOGLE_FIT_CLIENT_ID") != "" {
		log.Println("Google Fit client initialized")
	} else {
		log.Println("Warning: Google Fit credentials not configured")
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
	mux.Handle("GET /api/foods/custom", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetCustomFoods)))
	mux.Handle("DELETE /api/foods/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleDeleteFood)))

	// Diary
	mux.Handle("GET /api/diary", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetDiary)))
	mux.Handle("GET /api/diary/range", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetDiaryRange)))
	mux.Handle("POST /api/diary", cfAuth.Middleware(http.HandlerFunc(handlers.HandleCreateDiaryEntry)))
	mux.Handle("PUT /api/diary/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUpdateDiaryEntry)))
	mux.Handle("DELETE /api/diary/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleDeleteDiaryEntry)))

	// Weight routes
	mux.Handle("GET /api/weight", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetWeightEntries)))
	mux.Handle("POST /api/weight", cfAuth.Middleware(http.HandlerFunc(handlers.HandleCreateWeightEntry)))
	mux.Handle("DELETE /api/weight/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleDeleteWeightEntry)))

	// Measurements routes
	mux.Handle("GET /api/measurements", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetMeasurements)))
	mux.Handle("POST /api/measurements", cfAuth.Middleware(http.HandlerFunc(handlers.HandleCreateMeasurement)))
	mux.Handle("DELETE /api/measurements/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleDeleteMeasurement)))

	// Stats routes
	mux.Handle("GET /api/stats/calories", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetCalorieStats)))
	mux.Handle("GET /api/stats/bank", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetBankStats)))

	// Drinks routes
	mux.Handle("GET /api/drinks", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetDrinks)))
	mux.Handle("POST /api/drinks", cfAuth.Middleware(http.HandlerFunc(handlers.HandleCreateDrink)))
	mux.Handle("PUT /api/drinks/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUpdateDrink)))
	mux.Handle("DELETE /api/drinks/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleDeleteDrink)))
	mux.Handle("GET /api/drinks/entries", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetDrinkEntries)))
	mux.Handle("POST /api/drinks/entries", cfAuth.Middleware(http.HandlerFunc(handlers.HandleAddDrinkEntry)))
	mux.Handle("DELETE /api/drinks/entries/{id}", cfAuth.Middleware(http.HandlerFunc(handlers.HandleDeleteDrinkEntry)))

	// Fitness routes
	mux.Handle("GET /api/fit/auth", cfAuth.Middleware(http.HandlerFunc(handlers.HandleFitAuth)))
	mux.Handle("GET /api/fit/callback", cfAuth.Middleware(http.HandlerFunc(handlers.HandleFitCallback)))
	mux.Handle("GET /api/fit/status", cfAuth.Middleware(http.HandlerFunc(handlers.HandleFitStatus)))
	mux.Handle("DELETE /api/fit/disconnect", cfAuth.Middleware(http.HandlerFunc(handlers.HandleFitDisconnect)))
	mux.Handle("GET /api/steps", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetSteps)))
	mux.Handle("POST /api/steps/sync", cfAuth.Middleware(http.HandlerFunc(handlers.HandleSyncSteps)))

	// Nutrition analysis routes
	mux.Handle("GET /api/nutrition/settings", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetNutritionSettings)))
	mux.Handle("PUT /api/nutrition/settings", cfAuth.Middleware(http.HandlerFunc(handlers.HandleUpdateNutritionSettings)))
	mux.Handle("GET /api/nutrition/daily", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetDailyNutrition)))
	mux.Handle("GET /api/nutrition/weekly", cfAuth.Middleware(http.HandlerFunc(handlers.HandleGetWeeklyAnalysis)))

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
