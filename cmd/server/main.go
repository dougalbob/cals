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
	"cals/internal/mealie"
)

const AppVersion = "2.0.0"

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	var withAuth func(http.Handler) http.Handler
	if cfg.DevMode {
		log.Println("⚠️  DEV_MODE ENABLED — Cloudflare Access is DISABLED for loopback/private requests")
		log.Printf("⚠️  Database: %s", cfg.DBPath)
		log.Printf("⚠️  Listen address: %s", cfg.ListenAddress())
		withAuth = auth.DevModeMiddleware(cfg.DevUserEmail)
	} else {
		cfAuth := auth.NewCloudflareAuth(cfg.CFTeamDomain, cfg.CFPolicyAUD)
		withAuth = cfAuth.Middleware
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

	if cfg.MealieBaseURL != "" && cfg.MealieAPIKey != "" {
		handlers.MealieClient = mealie.NewClient(cfg.MealieBaseURL, cfg.MealieAPIKey)
		log.Println("Mealie client initialized")
	} else {
		log.Println("Warning: Mealie credentials not configured (MEALIE_BASE_URL and/or MEALIE_API_KEY missing)")
	}

	// Initialize Google Fit
	handlers.InitFitness()
	if os.Getenv("GOOGLE_FIT_CLIENT_ID") != "" {
		log.Println("Google Fit client initialized")
	} else {
		log.Println("Warning: Google Fit credentials not configured")
	}

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

	// Debug endpoint (temporary; protected like every non-public API route)
	mux.Handle("GET /api/debug/fatsecret", withAuth(http.HandlerFunc(handlers.HandleTestFatSecret)))

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

	// Temporary React frontend entrypoint. The legacy app remains the default at /.
	mux.HandleFunc("GET /next", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/next/", http.StatusPermanentRedirect)
	})
	mux.Handle("GET /next/", nextFrontendHandler("web/dist"))

	// API routes (protected)
	// Users
	mux.Handle("GET /api/users/me", withAuth(http.HandlerFunc(handlers.HandleGetCurrentUser)))
	mux.Handle("PUT /api/users/me", withAuth(http.HandlerFunc(handlers.HandleUpdateCurrentUser)))
	mux.Handle("GET /api/users", withAuth(http.HandlerFunc(handlers.HandleListUsers)))

	// Foods
	mux.Handle("GET /api/foods/search", withAuth(http.HandlerFunc(handlers.HandleSearchFoods)))
	mux.Handle("GET /api/foods/{id}", withAuth(http.HandlerFunc(handlers.HandleGetFood)))
	mux.Handle("PUT /api/foods/{id}", withAuth(http.HandlerFunc(handlers.HandleUpdateFood)))
	mux.Handle("POST /api/foods", withAuth(http.HandlerFunc(handlers.HandleCreateFood)))
	mux.Handle("GET /api/foods/custom", withAuth(http.HandlerFunc(handlers.HandleGetCustomFoods)))
	mux.Handle("DELETE /api/foods/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteFood)))

	// Diary
	mux.Handle("GET /api/diary", withAuth(http.HandlerFunc(handlers.HandleGetDiary)))
	mux.Handle("GET /api/diary/range", withAuth(http.HandlerFunc(handlers.HandleGetDiaryRange)))
	mux.Handle("POST /api/diary", withAuth(http.HandlerFunc(handlers.HandleCreateDiaryEntry)))
	mux.Handle("PUT /api/diary/{id}", withAuth(http.HandlerFunc(handlers.HandleUpdateDiaryEntry)))
	mux.Handle("DELETE /api/diary/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteDiaryEntry)))

	// Weight routes
	mux.Handle("GET /api/weight", withAuth(http.HandlerFunc(handlers.HandleGetWeightEntries)))
	mux.Handle("POST /api/weight", withAuth(http.HandlerFunc(handlers.HandleCreateWeightEntry)))
	mux.Handle("DELETE /api/weight/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteWeightEntry)))

	// Measurements routes
	mux.Handle("GET /api/measurements", withAuth(http.HandlerFunc(handlers.HandleGetMeasurements)))
	mux.Handle("POST /api/measurements", withAuth(http.HandlerFunc(handlers.HandleCreateMeasurement)))
	mux.Handle("DELETE /api/measurements/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteMeasurement)))

	// Stats routes
	mux.Handle("GET /api/stats/calories", withAuth(http.HandlerFunc(handlers.HandleGetCalorieStats)))
	mux.Handle("GET /api/stats/bank", withAuth(http.HandlerFunc(handlers.HandleGetBankStats)))

	// Drinks routes
	mux.Handle("GET /api/drinks", withAuth(http.HandlerFunc(handlers.HandleGetDrinks)))
	mux.Handle("POST /api/drinks", withAuth(http.HandlerFunc(handlers.HandleCreateDrink)))
	mux.Handle("PUT /api/drinks/{id}", withAuth(http.HandlerFunc(handlers.HandleUpdateDrink)))
	mux.Handle("DELETE /api/drinks/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteDrink)))
	mux.Handle("GET /api/drinks/entries", withAuth(http.HandlerFunc(handlers.HandleGetDrinkEntries)))
	mux.Handle("POST /api/drinks/entries", withAuth(http.HandlerFunc(handlers.HandleAddDrinkEntry)))
	mux.Handle("DELETE /api/drinks/entries/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteDrinkEntry)))

	// Fitness routes
	mux.Handle("GET /api/fit/auth", withAuth(http.HandlerFunc(handlers.HandleFitAuth)))
	mux.Handle("GET /api/fit/callback", withAuth(http.HandlerFunc(handlers.HandleFitCallback)))
	mux.Handle("GET /api/fit/status", withAuth(http.HandlerFunc(handlers.HandleFitStatus)))
	mux.Handle("DELETE /api/fit/disconnect", withAuth(http.HandlerFunc(handlers.HandleFitDisconnect)))
	mux.Handle("GET /api/steps", withAuth(http.HandlerFunc(handlers.HandleGetSteps)))
	mux.Handle("POST /api/steps/sync", withAuth(http.HandlerFunc(handlers.HandleSyncSteps)))

	// Nutrition analysis routes
	mux.Handle("GET /api/nutrition/settings", withAuth(http.HandlerFunc(handlers.HandleGetNutritionSettings)))
	mux.Handle("PUT /api/nutrition/settings", withAuth(http.HandlerFunc(handlers.HandleUpdateNutritionSettings)))
	mux.Handle("GET /api/nutrition/daily", withAuth(http.HandlerFunc(handlers.HandleGetDailyNutrition)))
	mux.Handle("GET /api/nutrition/weekly", withAuth(http.HandlerFunc(handlers.HandleGetWeeklyAnalysis)))

	// Bank
	mux.Handle("GET /api/bank", withAuth(http.HandlerFunc(handlers.HandleGetBank)))

	// Recipes
	mux.Handle("GET /api/recipes", withAuth(http.HandlerFunc(handlers.HandleListRecipes)))
	mux.Handle("GET /api/recipes/{id}", withAuth(http.HandlerFunc(handlers.HandleGetRecipe)))
	mux.Handle("POST /api/recipes", withAuth(http.HandlerFunc(handlers.HandleCreateRecipe)))
	mux.Handle("PUT /api/recipes/{id}", withAuth(http.HandlerFunc(handlers.HandleUpdateRecipe)))
	mux.Handle("DELETE /api/recipes/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteRecipe)))

	// Recipe images
	mux.Handle("POST /api/recipes/{id}/image", withAuth(http.HandlerFunc(handlers.HandleUploadRecipeImage)))
	mux.Handle("GET /api/images/recipes/{id}/{type}", withAuth(http.HandlerFunc(handlers.HandleGetRecipeImage)))

	// Mealie integration
	mux.Handle("GET /api/mealie/search", withAuth(http.HandlerFunc(handlers.HandleMealieSearch)))
	mux.Handle("POST /api/mealie/import/{id}", withAuth(http.HandlerFunc(handlers.HandleMealieImport)))

	// Index page - catch all for SPA
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, "web/templates/index.html")
	})

	log.Printf("Starting Cals v%s on %s", AppVersion, cfg.ListenAddress())
	if err := http.ListenAndServe(cfg.ListenAddress(), mux); err != nil {
		log.Fatalf("Server failed: %v", err)
		os.Exit(1)
	}
}
