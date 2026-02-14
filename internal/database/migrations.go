package database

import (
	"log"
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
			created_by_user_id INTEGER NOT NULL,
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
			FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
			FOREIGN KEY (food_id) REFERENCES foods(id)
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

		// Migration: Add bank_start_date to existing users table if missing
		`ALTER TABLE users ADD COLUMN bank_start_date DATE`,
	}

	for _, migration := range migrations {
		_, err := DB.Exec(migration)
		if err != nil {
			// Ignore "duplicate column" errors from ALTER TABLE
			if !contains(err.Error(), "duplicate column") {
				log.Printf("Migration note: %v", err)
			}
		}
	}

	log.Println("Database migrations completed successfully")
	return nil
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsImpl(s, substr))
}

func containsImpl(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
