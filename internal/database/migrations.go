package database

import (
	"log"
	"strings"
)

func RunMigrations() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT UNIQUE NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			daily_calorie_goal INTEGER NOT NULL DEFAULT 2000,
			daily_water_goal_ml INTEGER NOT NULL DEFAULT 2000,
			weight_unit TEXT NOT NULL DEFAULT 'stones',
			bank_start_date DATE,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS foods (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fatsecret_id TEXT,
			name TEXT NOT NULL,
			brand TEXT,
			calories_per_100g REAL NOT NULL DEFAULT 0,
			protein_per_100g REAL NOT NULL DEFAULT 0,
			carbs_per_100g REAL NOT NULL DEFAULT 0,
			fat_per_100g REAL NOT NULL DEFAULT 0,
			fibre_per_100g REAL NOT NULL DEFAULT 0,
			serving_name TEXT,
			serving_grams REAL,
			is_edited BOOLEAN NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE INDEX IF NOT EXISTS idx_foods_fatsecret_id ON foods(fatsecret_id)`,
		`CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name)`,

		`CREATE TABLE IF NOT EXISTS food_servings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			food_id INTEGER NOT NULL,
			fatsecret_serving_id TEXT,
			description TEXT NOT NULL,
			grams REAL NOT NULL,
			FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
		)`,

		`CREATE TABLE IF NOT EXISTS recipes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			instructions TEXT,
			image_filename TEXT,
			serves INTEGER DEFAULT 1,
			created_by_user_id INTEGER NOT NULL,
			calculated_weight_grams REAL NOT NULL DEFAULT 0,
			total_weight_grams REAL NOT NULL DEFAULT 0,
			weight_is_manual BOOLEAN NOT NULL DEFAULT 0,
			is_own_creation INTEGER NOT NULL DEFAULT 0,
			total_calories REAL NOT NULL DEFAULT 0,
			total_protein REAL NOT NULL DEFAULT 0,
			total_carbs REAL NOT NULL DEFAULT 0,
			total_fat REAL NOT NULL DEFAULT 0,
			total_fibre REAL NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (created_by_user_id) REFERENCES users(id)
		)`,

		`CREATE TABLE IF NOT EXISTS recipe_ingredients (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			recipe_id INTEGER NOT NULL,
			food_id INTEGER NOT NULL,
			quantity_grams REAL NOT NULL,
			sort_order INTEGER DEFAULT 0,
			FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
			FOREIGN KEY (food_id) REFERENCES foods(id)
		)`,

		`CREATE TABLE IF NOT EXISTS recipe_text_ingredients (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			recipe_id INTEGER NOT NULL,
			description TEXT NOT NULL,
			sort_order INTEGER DEFAULT 0,
			FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
		)`,

		// Phase 13: favourites are personal even though the recipe catalogue is shared.
		`CREATE TABLE IF NOT EXISTS recipe_favourites (
			user_id INTEGER NOT NULL,
			recipe_id INTEGER NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (user_id, recipe_id),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
		)`,

		// Phase 13: shared recipe classification and filtering metadata.
		`ALTER TABLE recipes ADD COLUMN dish_type TEXT CHECK (dish_type IS NULL OR dish_type IN ('main', 'side', 'soup', 'salad', 'dessert'))`,
		`ALTER TABLE recipes ADD COLUMN total_time_minutes INTEGER CHECK (total_time_minutes IS NULL OR total_time_minutes > 0)`,
		`CREATE TABLE IF NOT EXISTS recipe_meal_occasions (
			recipe_id INTEGER NOT NULL,
			occasion TEXT NOT NULL CHECK (occasion IN ('breakfast', 'lunch', 'dinner', 'snack')),
			PRIMARY KEY (recipe_id, occasion),
			FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS recipe_key_foods (
			recipe_id INTEGER NOT NULL,
			food_id INTEGER NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (recipe_id, food_id),
			FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
			FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE RESTRICT
		)`,
		`CREATE INDEX IF NOT EXISTS idx_recipe_key_foods_food_id ON recipe_key_foods(food_id)`,

		// Phase 13: a person's usual portion of a shared recipe. `serves` stays
		// recipe-level yield information; it is not an assumption about how much
		// an individual eats. Recipe logging converts every choice to grams and
		// diary rows keep their own nutrition snapshot.
		`CREATE TABLE IF NOT EXISTS recipe_user_portions (
			user_id INTEGER NOT NULL,
			recipe_id INTEGER NOT NULL,
			grams REAL NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (user_id, recipe_id),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
		)`,

		// Food measures (serving_name/serving_grams plus additional named
		// gram-backed choices) are stored in food_servings beside the
		// FatSecret-provided rows; user-defined rows have no
		// fatsecret_serving_id and are the ones an edit may replace.
		`CREATE INDEX IF NOT EXISTS idx_food_servings_food_id ON food_servings(food_id)`,

		`CREATE TABLE IF NOT EXISTS diary_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			date DATE NOT NULL,
			meal TEXT NOT NULL CHECK(meal IN ('breakfast', 'lunch', 'dinner', 'snacks')),
			food_id INTEGER,
			recipe_id INTEGER,
			quantity_grams REAL NOT NULL,
			calories REAL NOT NULL,
			protein REAL NOT NULL DEFAULT 0,
			carbs REAL NOT NULL DEFAULT 0,
			fat REAL NOT NULL DEFAULT 0,
			fibre REAL NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id),
			FOREIGN KEY (food_id) REFERENCES foods(id),
			FOREIGN KEY (recipe_id) REFERENCES recipes(id),
			CHECK (food_id IS NOT NULL OR recipe_id IS NOT NULL)
		)`,

		`CREATE INDEX IF NOT EXISTS idx_diary_user_date ON diary_entries(user_id, date)`,

		`CREATE TABLE IF NOT EXISTS drinks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        icon TEXT NOT NULL,
                        volume_ml INTEGER NOT NULL,
                        calories INTEGER NOT NULL DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                )`,

		`CREATE TABLE IF NOT EXISTS drink_entries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        drink_id INTEGER NOT NULL,
                        date DATE NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id),
                        FOREIGN KEY (drink_id) REFERENCES drinks(id)
                )`,

		`CREATE INDEX IF NOT EXISTS idx_drink_entries_user_date ON drink_entries(user_id, date)`,

		`CREATE TABLE IF NOT EXISTS fit_tokens (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL UNIQUE,
                        access_token TEXT NOT NULL,
                        refresh_token TEXT NOT NULL,
                        expires_at DATETIME NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                )`,

		`CREATE TABLE IF NOT EXISTS step_entries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        date DATE NOT NULL,
                        steps INTEGER NOT NULL,
                        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id),
                        UNIQUE(user_id, date)
                )`,

		`CREATE INDEX IF NOT EXISTS idx_step_entries_user_date ON step_entries(user_id, date)`,

		`CREATE TABLE IF NOT EXISTS nutrition_settings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL UNIQUE,
                        protein_goal_per_kg REAL NOT NULL DEFAULT 0.8,
                        fibre_goal REAL NOT NULL DEFAULT 30,
                        fat_max_percent REAL NOT NULL DEFAULT 35,
                        carb_min_percent REAL NOT NULL DEFAULT 45,
                        carb_max_percent REAL NOT NULL DEFAULT 65,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                )`,

		`CREATE TABLE IF NOT EXISTS weight_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			date DATE NOT NULL,
			weight_kg REAL NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,

		`CREATE INDEX IF NOT EXISTS idx_weight_user_date ON weight_entries(user_id, date)`,

		`CREATE TABLE IF NOT EXISTS measurement_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			date DATE NOT NULL,
			bust_cm REAL,
			chest_cm REAL,
			waist_cm REAL,
			hips_cm REAL,
			upper_arm_cm REAL,
			thigh_cm REAL,
			neck_cm REAL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,

		`CREATE INDEX IF NOT EXISTS idx_measurements_user_date ON measurement_entries(user_id, date)`,

		`CREATE TABLE IF NOT EXISTS weight_goals (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			month TEXT NOT NULL,
			target_loss_kg REAL NOT NULL,
			start_weight_kg REAL NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id),
			UNIQUE(user_id, month)
		)`,

		`CREATE TABLE IF NOT EXISTS daily_notes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			date DATE NOT NULL,
			note TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id),
			UNIQUE(user_id, date)
		)`,

		// Migrations for existing tables
		`ALTER TABLE users ADD COLUMN bank_start_date DATE`,
		`ALTER TABLE users ADD COLUMN target_weight_kg REAL`,
		`ALTER TABLE foods ADD COLUMN serving_name TEXT`,
		`ALTER TABLE foods ADD COLUMN serving_grams REAL`,
		`ALTER TABLE recipes ADD COLUMN description TEXT`,
		`ALTER TABLE recipes ADD COLUMN instructions TEXT`,
		`ALTER TABLE recipes ADD COLUMN image_filename TEXT`,
		`ALTER TABLE recipes ADD COLUMN serves INTEGER DEFAULT 1`,
		`ALTER TABLE recipes ADD COLUMN calculated_weight_grams REAL DEFAULT 0`,
		`ALTER TABLE recipe_ingredients ADD COLUMN sort_order INTEGER DEFAULT 0`,

		// Phase 12 (water): one source of truth is drink_entries for drinks
		// flagged as water. The dead water_entries table is removed further
		// down (additively: only when it is empty).
		`ALTER TABLE drinks ADD COLUMN counts_toward_water INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE drink_entries ADD COLUMN volume_ml INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE drink_entries ADD COLUMN calories INTEGER NOT NULL DEFAULT 0`,

		// Drinks builder (My drinks / vary-this-time). Additive defaults so
		// existing rows keep working as one-tap usuals with no extras sheet.
		`ALTER TABLE drinks ADD COLUMN accepts_milk INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE drinks ADD COLUMN accepts_sugar INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE drinks ADD COLUMN usual_milk INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE drinks ADD COLUMN usual_sugar TEXT NOT NULL DEFAULT '0'`,
		`ALTER TABLE drinks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,

		// Decision 59: recipes are retired by archiving, never by deleting a row
		// that Diary history points at. Additive: every existing recipe stays
		// visible (is_archived = 0).
		`ALTER TABLE recipes ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE recipes ADD COLUMN archived_at DATETIME`,

		// Phase 13: an optional shared marker for recipes created by the household.
		// Existing recipes are not marked by default.
		`ALTER TABLE recipes ADD COLUMN is_own_creation INTEGER NOT NULL DEFAULT 0`,

		// Decisions 45 and 88: the Admin/Standard role. Additive, so every
		// existing account stays Standard (0). The declared source of truth is
		// ADMIN_EMAILS / STANDARD_EMAILS in /app/data/.env, reconciled into this
		// column at start-up; see internal/handlers/roles.go.
		`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`,

		// Phase 14 slice 14.2 (decisions 66, 91, 92, 93): the bank is a rolling
		// window of the previous N completed calendar days rather than an
		// accumulation since bank_start_date. Additive with a default of 14, so
		// every existing account keeps working with no data operation. 0 means
		// "all time" — no length limit, still bounded below by bank_start_date
		// and still excluding unlogged days (decision 91). Read by every bank
		// calculation and writable through PUT /api/users/me; the Settings
		// control itself is Phase 15 (decision 93).
		`ALTER TABLE users ADD COLUMN bank_window_days INTEGER NOT NULL DEFAULT 14`,

		// Phase 14 slice 14.3 (decisions 70, 95): the weigh-in chart's trend is
		// a moving average over the weigh-ins themselves, not over calendar
		// days, and its window is a per-user preference. Additive with a
		// default of 7, so every existing account keeps working with no data
		// operation. Read by the Metrics chart through GET /api/users/me and
		// writable through PUT /api/users/me; the Settings control itself is
		// Phase 15 (decision 95), the same "column now, control later" pattern
		// as bank_window_days (decision 93). Values below 3 are rejected by the
		// handler: a trend over fewer than three weigh-ins is never drawn
		// (decision 95), so such a window could never do anything.
		`ALTER TABLE users ADD COLUMN weight_trend_days INTEGER NOT NULL DEFAULT 7`,

		// Phase 14 slice 14.4 (decision 97): which silhouette the Metrics
		// body map draws. Additive and nullable — NULL means "not chosen yet",
		// and the map offers a one-off Female / Male pick the first time it
		// opens, saved through PUT /api/users/me. The female outline carries
		// the Bust point and the male outline the Chest point (decision 98),
		// keeping both measurement columns meaningful.
		`ALTER TABLE users ADD COLUMN body_outline TEXT`,
	}

	for _, migration := range migrations {
		_, err := DB.Exec(migration)
		if err != nil {
			if !strings.Contains(err.Error(), "duplicate column") &&
				!strings.Contains(err.Error(), "already exists") {
				log.Printf("Migration note: %v", err)
			}
		}
	}

	// Phase 12 backfills, all idempotent and additive.

	// Drinks historically named "Water" count towards the water target. Only a
	// literal name match is used; anything else stays flagged off.
	_, _ = DB.Exec(`
		UPDATE drinks
		SET counts_toward_water = 1
		WHERE lower(trim(name)) = 'water' AND counts_toward_water = 0
	`)

	// Drink entries snapshot the volume and calories logged, like diary
	// entries do. Existing rows (created before the columns existed) take the
	// values from their drink definition.
	_, _ = DB.Exec(`
		UPDATE drink_entries
		SET volume_ml = COALESCE((SELECT volume_ml FROM drinks WHERE drinks.id = drink_entries.drink_id), volume_ml),
		    calories = COALESCE((SELECT calories FROM drinks WHERE drinks.id = drink_entries.drink_id), calories)
		WHERE volume_ml = 0
	`)

	// Remove the dead water_entries table (schema-only, never had a handler or
	// endpoint). Additive rule: only drop it when it holds no rows; otherwise
	// keep it and say so, and let the owner decide.
	var waterEntryCount int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM water_entries`).Scan(&waterEntryCount); err == nil {
		if waterEntryCount == 0 {
			if _, err := DB.Exec(`DROP TABLE IF EXISTS water_entries`); err != nil {
				log.Printf("Migration note: could not drop the unused water_entries table: %v", err)
			}
		} else {
			log.Printf("Migration note: water_entries still holds %d row(s); left in place and unused. Water lives in drink_entries for drinks with counts_toward_water=1", waterEntryCount)
		}
	}

	// Backfill calculated_weight_grams for existing recipes
	_, _ = DB.Exec(`
		UPDATE recipes 
		SET calculated_weight_grams = (
			SELECT COALESCE(SUM(ri.quantity_grams), 0)
			FROM recipe_ingredients ri
			WHERE ri.recipe_id = recipes.id
		)
		WHERE calculated_weight_grams = 0 OR calculated_weight_grams IS NULL
	`)

	log.Println("Database migrations completed successfully")
	return nil
}
