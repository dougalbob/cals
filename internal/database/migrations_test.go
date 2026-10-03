package database

import (
	"path/filepath"
	"testing"
)

func setupMigrationDB(t *testing.T) {
	t.Helper()
	Close()
	if err := Initialize(filepath.Join(t.TempDir(), "test.db")); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	t.Cleanup(Close)
}

func tableExists(t *testing.T, name string) bool {
	t.Helper()
	var count int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, name).Scan(&count); err != nil {
		t.Fatalf("checking table %s: %v", name, err)
	}
	return count > 0
}

// Phase 12: water is stored in drink_entries for flagged drinks. The dead
// water_entries table must not survive a fresh install as a second ledger.
func TestWaterEntriesTableIsRemovedWhenEmpty(t *testing.T) {
	setupMigrationDB(t)

	if tableExists(t, "water_entries") {
		t.Error("water_entries should not exist after migrations")
	}
}

// Existing databases may still carry the legacy table; when it is empty it is
// dropped, and when it holds rows it is kept and ignored (additive rule).
func TestLegacyWaterEntriesWithRowsAreKept(t *testing.T) {
	Close()
	dbPath := filepath.Join(t.TempDir(), "legacy.db")

	// Simulate a pre-Phase-12 database.
	if err := Initialize(dbPath); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if _, err := DB.Exec(`CREATE TABLE water_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		date DATE NOT NULL,
		amount_ml INTEGER NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		t.Fatalf("creating legacy table: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO water_entries (user_id, date, amount_ml) VALUES (1, '2026-09-01', 500)`); err != nil {
		t.Fatalf("inserting legacy row: %v", err)
	}
	Close()

	if err := Initialize(dbPath); err != nil {
		t.Fatalf("re-initializing: %v", err)
	}
	defer Close()

	if !tableExists(t, "water_entries") {
		t.Error("water_entries with rows must not be dropped (additive migration rule)")
	}
	var amount int
	if err := DB.QueryRow(`SELECT amount_ml FROM water_entries LIMIT 1`).Scan(&amount); err != nil {
		t.Fatalf("reading legacy row: %v", err)
	}
	if amount != 500 {
		t.Errorf("legacy amount_ml = %d, want 500 (data must be preserved)", amount)
	}
}

func TestMigrationsBackfillWaterFlagAndEntrySnapshots(t *testing.T) {
	Close()
	dbPath := filepath.Join(t.TempDir(), "backfill.db")

	if err := Initialize(dbPath); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	var userID int64
	result, err := DB.Exec(`INSERT INTO users (email) VALUES ('wife@example.com')`)
	if err != nil {
		t.Fatalf("inserting user: %v", err)
	}
	userID, _ = result.LastInsertId()

	// A drink named Water, and an entry logged before the new columns existed.
	insert, err := DB.Exec(`INSERT INTO drinks (user_id, name, icon, volume_ml, calories) VALUES (?, 'Water', '💧', 250, 0)`, userID)
	if err != nil {
		t.Fatalf("inserting drink: %v", err)
	}
	drinkID, _ := insert.LastInsertId()
	if _, err := DB.Exec(`INSERT INTO drink_entries (user_id, drink_id, date) VALUES (?, ?, '2026-09-01')`, userID, drinkID); err != nil {
		t.Fatalf("inserting entry: %v", err)
	}
	Close()

	if err := Initialize(dbPath); err != nil {
		t.Fatalf("re-initializing: %v", err)
	}
	defer Close()

	var flags int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM drinks WHERE counts_toward_water = 1 AND name = 'Water'`).Scan(&flags); err != nil {
		t.Fatalf("counting flagged drinks: %v", err)
	}
	if flags != 1 {
		t.Errorf("water-flagged drinks = %d, want 1 (backfill by name)", flags)
	}

	var volume, calories int
	if err := DB.QueryRow(`SELECT volume_ml, calories FROM drink_entries LIMIT 1`).Scan(&volume, &calories); err != nil {
		t.Fatalf("reading entry snapshot: %v", err)
	}
	if volume != 250 {
		t.Errorf("entry volume_ml = %d, want 250 (backfilled from the drink)", volume)
	}
}

// Decision 59: archiving is an additive column pair. Existing recipes must come
// through unarchived, and re-running migrations must be harmless.
func TestRecipeArchiveColumnsAreAdditiveAndDefaultToVisible(t *testing.T) {
	Close()
	dbPath := filepath.Join(t.TempDir(), "archive.db")
	if err := Initialize(dbPath); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO users (email) VALUES ('wife@example.com')`); err != nil {
		t.Fatalf("inserting user: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO recipes (name, created_by_user_id) VALUES ('Existing recipe', 1)`); err != nil {
		t.Fatalf("inserting recipe: %v", err)
	}
	Close()

	// A second start re-runs every migration against a populated database.
	if err := Initialize(dbPath); err != nil {
		t.Fatalf("second Initialize() error = %v", err)
	}
	t.Cleanup(Close)

	var isArchived int
	var archivedAt *string
	if err := DB.QueryRow(`SELECT is_archived, archived_at FROM recipes WHERE name = 'Existing recipe'`).Scan(&isArchived, &archivedAt); err != nil {
		t.Fatalf("reading archive columns: %v", err)
	}
	if isArchived != 0 || archivedAt != nil {
		t.Errorf("existing recipe should stay visible: is_archived=%d archived_at=%v", isArchived, archivedAt)
	}
}
