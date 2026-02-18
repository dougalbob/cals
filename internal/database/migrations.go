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

		`CREATE TABLE IF NOT EXISTS water_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			date DATE NOT NULL,
			amount_ml INTEGER NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,

		`CREATE INDEX IF NOT EXISTS idx_water_user_date ON water_entries(user_id, date)`,

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
