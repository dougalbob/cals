package main

import (
	"encoding/json"
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

	var authenticate func(http.Handler) http.Handler
	devIdentitySwitch := false
	if cfg.DevMode {
		log.Println("⚠️  DEV_MODE ENABLED — Cloudflare Access is DISABLED for loopback/private requests")
		log.Printf("⚠️  Database: %s", cfg.DBPath)
		log.Printf("⚠️  Listen address: %s", cfg.ListenAddress())
		if cfg.DevIdentitySwitch {
			devIdentitySwitch = true
			authenticate = auth.DevIdentityMiddleware(cfg.DevUserEmail, handlers.UserExistsByEmail)
			log.Println("⚠️  DEV_IDENTITY_SWITCH ENABLED — choose any existing user at /dev/identity (or append ?as=<email> to any URL)")
			log.Printf("⚠️  Default identity: %s", cfg.DevUserEmail)
		} else {
			authenticate = auth.DevModeMiddleware(cfg.DevUserEmail)
		}
	} else {
		cfAuth := auth.NewCloudflareAuth(cfg.CFTeamDomain, cfg.CFPolicyAUD)
		authenticate = cfAuth.Middleware
	}

	// Every authenticated request then passes through the Admin acting-user
	// switch, which may replace *whose data* the request touches. It never
	// replaces the authenticated identity, so role checks stay trustworthy.
	withAuth := func(next http.Handler) http.Handler {
		return authenticate(handlers.ActingUserMiddleware(next))
	}

	if err := database.Initialize(cfg.DBPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Roles are declared in /app/data/.env (ADMIN_EMAILS / STANDARD_EMAILS) and
	// reconciled into users.is_admin here, so the running container always
	// matches the configuration on disk. See internal/handlers/roles.go.
	handlers.SetConfiguredRoles(cfg.AdminEmails, cfg.StandardEmails)
	roles, err := handlers.ApplyConfiguredRoles()
	if err != nil {
		log.Fatalf("Failed to apply configured user roles: %v", err)
	}
	logConfiguredRoles(roles)

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

	if devIdentitySwitch {
		// Minimal dev-only identity picker. Registered only when both DEV_MODE
		// and DEV_IDENTITY_SWITCH are true; the middleware restricts it to
		// loopback/private peers, exactly like every other dev-mode route.
		mux.Handle("GET /dev/identity", withAuth(http.HandlerFunc(handlers.HandleDevIdentityPage)))
	}

	// Health check (unprotected)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Version endpoint (unprotected)
	mux.HandleFunc("GET /api/version", versionHandler(devIdentitySwitch))

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

	// Session: who is signed in, whose data is on screen, and the Admin's
	// acting-user switch (decisions 45 and 88).
	mux.Handle("GET /api/session", withAuth(http.HandlerFunc(handlers.HandleGetSession)))
	mux.Handle("POST /api/session/acting-user", withAuth(http.HandlerFunc(handlers.HandleSetActingUser)))
	mux.Handle("DELETE /api/session/acting-user", withAuth(http.HandlerFunc(handlers.HandleClearActingUser)))

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

	// Measurements routes. Slice 14.4 added the per-part update path (decision
	// 96) and the latest-per-part lookup the body map's pop-up reads.
	mux.Handle("GET /api/measurements", withAuth(http.HandlerFunc(handlers.HandleGetMeasurements)))
	mux.Handle("GET /api/measurements/latest", withAuth(http.HandlerFunc(handlers.HandleGetLatestMeasurements)))
	mux.Handle("POST /api/measurements", withAuth(http.HandlerFunc(handlers.HandleCreateMeasurement)))
	mux.Handle("PUT /api/measurements/{id}", withAuth(http.HandlerFunc(handlers.HandleUpdateMeasurement)))
	mux.Handle("DELETE /api/measurements/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteMeasurement)))

	// Stats routes
	mux.Handle("GET /api/stats/calories", withAuth(http.HandlerFunc(handlers.HandleGetCalorieStats)))
	mux.Handle("GET /api/stats/bank", withAuth(http.HandlerFunc(handlers.HandleGetBankStats)))

	// Calendar: per-day summaries for the month/week calendar views (decision 49).
	mux.Handle("GET /api/calendar", withAuth(http.HandlerFunc(handlers.HandleGetCalendar)))

	// Drinks routes
	mux.Handle("GET /api/drinks", withAuth(http.HandlerFunc(handlers.HandleGetDrinks)))
	mux.Handle("POST /api/drinks", withAuth(http.HandlerFunc(handlers.HandleCreateDrink)))
	mux.Handle("PUT /api/drinks/{id}", withAuth(http.HandlerFunc(handlers.HandleUpdateDrink)))
	mux.Handle("DELETE /api/drinks/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteDrink)))
	mux.Handle("GET /api/drinks/entries", withAuth(http.HandlerFunc(handlers.HandleGetDrinkEntries)))
	mux.Handle("POST /api/drinks/entries", withAuth(http.HandlerFunc(handlers.HandleAddDrinkEntry)))
	mux.Handle("DELETE /api/drinks/entries/{id}", withAuth(http.HandlerFunc(handlers.HandleDeleteDrinkEntry)))

	// Water (one source of truth: drink entries for drinks flagged counts_toward_water)
	mux.Handle("GET /api/water", withAuth(http.HandlerFunc(handlers.HandleGetWater)))

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
	mux.Handle("PUT /api/recipes/{id}/archive", withAuth(http.HandlerFunc(handlers.HandleSetRecipeArchived)))
	mux.Handle("PUT /api/recipes/{id}/favourite", withAuth(http.HandlerFunc(handlers.HandleSetRecipeFavourite)))
	mux.Handle("PUT /api/recipes/{id}/metadata", withAuth(http.HandlerFunc(handlers.HandleUpdateRecipeMetadata)))

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

// logConfiguredRoles prints the role reconciliation, because a misspelled
// address or an account that has not signed in yet is otherwise invisible: the
// app would simply behave as if the Admin were a Standard user.
func logConfiguredRoles(applied handlers.RoleApplication) {
	if !applied.Configured {
		if len(applied.StandardEmails) > 0 {
			log.Printf("Roles: STANDARD_EMAILS is set but ADMIN_EMAILS is not — every account stays Standard (no Standard list is applied without an Admin)")
		}
		return
	}

	log.Printf("Roles: Admin: %s", strings.Join(applied.AdminEmails, ", "))
	if len(applied.StandardEmails) > 0 {
		log.Printf("Roles: Standard: %s", strings.Join(applied.StandardEmails, ", "))
	}
	for _, email := range applied.Granted {
		log.Printf("Roles: granted Admin to %s", email)
	}
	for _, email := range applied.Revoked {
		log.Printf("Roles: revoked Admin from %s (no longer listed in ADMIN_EMAILS)", email)
	}
	for _, email := range applied.Missing {
		log.Printf("Roles: %s is configured but has no account yet; the role applies on first sign-in", email)
	}
}

type apiVersionResponse struct {
	Version           string `json:"version"`
	DevIdentitySwitch bool   `json:"dev_identity_switch,omitempty"`
}

func versionHandler(devIdentitySwitch bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		_ = json.NewEncoder(w).Encode(apiVersionResponse{
			Version:           AppVersion,
			DevIdentitySwitch: devIdentitySwitch,
		})
	}
}
