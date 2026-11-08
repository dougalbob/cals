package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
)

// setupBackupTestDB creates a disposable SQLite database in t.TempDir with the
// full migrations applied, and a recipe image directory with one test image.
// It returns the temp dir, the DB path, and cleanup (deferred by caller).
func setupBackupTestDB(t *testing.T) (dir, dbPath, imgDir string) {
	t.Helper()
	dir = t.TempDir()
	dbPath = filepath.Join(dir, "cals.db")
	// Let the restore code know where the live database file is so it can
	// replace it during restore tests.
	SetLiveDBPath(dbPath)
	if err := database.Initialize(dbPath); err != nil {
		t.Fatalf("init db: %v", err)
	}
	t.Cleanup(database.Close)
	imgDir = filepath.Join(dir, "images", "recipes")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		t.Fatalf("mkdir images: %v", err)
	}
	// Write a fake recipe image file so the backup has something to bundle.
	if err := os.WriteFile(filepath.Join(imgDir, "1_v_abc_original.jpg"), []byte("fake-original"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(imgDir, "1_v_abc_thumb.jpg"), []byte("fake-thumb"), 0644); err != nil {
		t.Fatal(err)
	}
	return dir, dbPath, imgDir
}

// installAdmin seeds an Admin user directly and declares the role in config
// so requireAdmin passes (it checks both the database column and the declared
// role list; without SetConfiguredRoles, IsConfiguredAdmin returns false).
func installAdmin(t *testing.T, email string) {
	t.Helper()
	_, err := database.DB.Exec(`INSERT INTO users (email, name, is_admin) VALUES (?, ?, 1)`, email, "Tester")
	if err != nil && !strings.Contains(err.Error(), "UNIQUE constraint") {
		t.Fatalf("seed admin: %v", err)
	}
	// Declare the role and apply it, matching what main does at startup.
	SetConfiguredRoles([]string{email}, nil)
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("apply roles: %v", err)
	}
}

// withTestAdmin returns an HTTP handler wrapped to simulate an authenticated
// Admin identity, suitable for unit-testing handlers directly.
func withTestAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(authSetEmail(r.Context(), "admin@example.com"))
		next.ServeHTTP(w, r)
	})
}

// authSetEmail sets the authenticated email on the context, simulating what
// the auth middleware does so requireAdmin passes for handler tests.
func authSetEmail(ctx context.Context, email string) context.Context {
	return auth.WithAuthenticatedEmail(ctx, email)
}

func TestCreateBackupWritesValidZip(t *testing.T) {
	dir, dbPath, imgDir := setupBackupTestDB(t)
	backups := filepath.Join(dir, "backups")
	backupDirOverride = backups
	recipeImageDirOverride = imgDir
	t.Cleanup(func() { backupDirOverride = ""; recipeImageDirOverride = "" })
	fixed := time.Date(2026, 11, 8, 10, 30, 0, 0, time.UTC)
	nowFunc = func() time.Time { return fixed }
	t.Cleanup(func() { nowFunc = time.Now })

	installAdmin(t, "admin@example.com")

	item, err := createBackup(context.Background(), "manual", "test")
	if err != nil {
		t.Fatalf("createBackup: %v", err)
	}
	if item.Filename == "" {
		t.Fatal("expected filename")
	}
	if item.SizeBytes <= 0 {
		t.Fatal("expected size")
	}
	// Verify the file opens as a ZIP and contains the expected entries.
	zr, err := zip.OpenReader(filepath.Join(backups, item.Filename))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	defer zr.Close()
	found := map[string]bool{}
	for _, f := range zr.File {
		found[f.Name] = true
	}
	for _, want := range []string{backupMetaName, backupDBName,
		backupImagesDir + "1_v_abc_original.jpg",
		backupImagesDir + "1_v_abc_thumb.jpg"} {
		if !found[want] {
			t.Errorf("missing zip entry %q (have %v)", want, found)
		}
	}
	_ = dbPath
}

func TestValidateSQLiteFileRejectsNonCalsDB(t *testing.T) {
	dir, _, _ := setupBackupTestDB(t)
	bad := filepath.Join(dir, "bad.db")
	if err := os.WriteFile(bad, []byte("not a database"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := validateSQLiteFile(bad); err == nil {
		t.Fatal("expected error validating a non-SQLite file")
	}
}

func TestConcurrentWritesDuringBackup(t *testing.T) {
	dir, _, imgDir := setupBackupTestDB(t)
	backups := filepath.Join(dir, "backups")
	backupDirOverride = backups
	recipeImageDirOverride = imgDir
	t.Cleanup(func() { backupDirOverride = ""; recipeImageDirOverride = "" })
	installAdmin(t, "admin@example.com")

	// Start a write goroutine that inserts diary-looking rows during the
	// backup (we use weight entries because they're simple and don't require
	// user_ids beyond the admin row we already inserted).
	// Grab the admin user id.
	var adminID int64
	if err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, "admin@example.com").Scan(&adminID); err != nil {
		t.Fatalf("read admin id: %v", err)
	}

	var wg sync.WaitGroup
	stop := make(chan struct{})
	var writes int64
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
				_, err := database.DB.Exec(`INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, date('now'), ?)`,
					adminID, 70.0+float64(atomic.LoadInt64(&writes))*0.01)
				if err == nil {
					atomic.AddInt64(&writes, 1)
				}
				time.Sleep(time.Millisecond)
			}
		}
	}()
	// Give the writer a moment to start.
	time.Sleep(20 * time.Millisecond)
	item, err := createBackup(context.Background(), "manual", "test")
	close(stop)
	wg.Wait()
	if err != nil {
		t.Fatalf("createBackup: %v", err)
	}
	t.Logf("writes during backup: %d", atomic.LoadInt64(&writes))
	if atomic.LoadInt64(&writes) == 0 {
		t.Error("expected at least one concurrent write to succeed during backup")
	}

	// The backup must pass integrity_check. Open the zip, extract cals.db to
	// a temp file, then run validateSQLiteFile on it.
	zr, err := zip.OpenReader(filepath.Join(backups, item.Filename))
	if err != nil {
		t.Fatalf("open backup: %v", err)
	}
	defer zr.Close()
	var dbEntry *zip.File
	for _, f := range zr.File {
		if f.Name == backupDBName {
			dbEntry = f
			break
		}
	}
	if dbEntry == nil {
		t.Fatal("cals.db not in backup")
	}
	extracted := filepath.Join(dir, "extracted.db")
	if err := writeZipEntryToTemp(dbEntry, extracted); err != nil {
		t.Fatalf("extract: %v", err)
	}
	if err := validateSQLiteFile(extracted); err != nil {
		t.Fatalf("backup db failed validation: %v", err)
	}
}

func writeZipEntryToTemp(f *zip.File, target string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.Create(target)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, rc); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func TestRequireAdminForbidsStandardUser(t *testing.T) {
	dir, _, _ := setupBackupTestDB(t)
	backups := filepath.Join(dir, "backups")
	backupDirOverride = backups
	t.Cleanup(func() { backupDirOverride = "" })
	if err := os.MkdirAll(backups, 0755); err != nil {
		t.Fatal(err)
	}
	installAdmin(t, "admin@example.com")
	// Request with no authenticated identity should be forbidden.
	req := httptest.NewRequest("GET", "/api/backups", nil)
	rr := httptest.NewRecorder()
	http.HandlerFunc(HandleListBackups).ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403 without admin identity, got %d", rr.Code)
	}

	// Request authenticated as Admin should proceed past the role check.
	req = httptest.NewRequest("GET", "/api/backups", nil)
	rr = httptest.NewRecorder()
	withTestAdmin(http.HandlerFunc(HandleListBackups)).ServeHTTP(rr, req)
	// After the role check passes, the handler runs and writes JSON.
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 with admin identity, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestAutoBackupRetention(t *testing.T) {
	dir, _, imgDir := setupBackupTestDB(t)
	backups := filepath.Join(dir, "backups")
	backupDirOverride = backups
	recipeImageDirOverride = imgDir
	t.Cleanup(func() { backupDirOverride = ""; recipeImageDirOverride = "" })
	if err := os.MkdirAll(backups, 0755); err != nil {
		t.Fatal(err)
	}
	installAdmin(t, "admin@example.com")

	// Simulate 10 old auto backups across 10 days.
	base := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for i := range 10 {
		ts := base.AddDate(0, 0, i)
		name := backupFilePrefixAuto + ts.UTC().Format(backupTimeLayout) + backupFileSuffix
		if err := os.WriteFile(filepath.Join(backups, name), []byte("dummy"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	// Today is day 11; RunAutoBackupIfDue should add one more and then prune
	// to autoBackupRetention (7).
	nowFunc = func() time.Time { return base.AddDate(0, 0, 11) }
	t.Cleanup(func() { nowFunc = time.Now })
	RunAutoBackupIfDue("test")
	entries, err := os.ReadDir(backups)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	var autos int
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), backupFilePrefixAuto) && strings.HasSuffix(e.Name(), backupFileSuffix) {
			autos++
		}
	}
	if autos != autoBackupRetention {
		t.Errorf("expected %d auto backups after prune, got %d", autoBackupRetention, autos)
	}
}

func TestRestoreRoundTrip(t *testing.T) {
	dir, _, imgDir := setupBackupTestDB(t)
	backups := filepath.Join(dir, "backups")
	backupDirOverride = backups
	recipeImageDirOverride = imgDir
	t.Cleanup(func() { backupDirOverride = ""; recipeImageDirOverride = "" })
	nowFunc = func() time.Time { return time.Date(2026, 11, 8, 12, 0, 0, 0, time.UTC) }
	t.Cleanup(func() { nowFunc = time.Now })
	installAdmin(t, "admin@example.com")

	var adminID int64
	if err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, "admin@example.com").Scan(&adminID); err != nil {
		t.Fatal(err)
	}
	// Insert something specific to look for after restore.
	if _, err := database.DB.Exec(`INSERT INTO weight_entries (user_id, date, weight_kg) VALUES (?, '2026-11-08', 80.5)`, adminID); err != nil {
		t.Fatal(err)
	}
	// Add a recipe-image reference so we know the image dir is right.
	if _, err := database.DB.Exec(`INSERT INTO recipes (name, created_by_user_id, image_filename) VALUES ('Test curry', ?, 'v_abc')`, adminID); err != nil {
		t.Fatal(err)
	}

	item, err := createBackup(context.Background(), "manual", "test")
	if err != nil {
		t.Fatalf("create backup: %v", err)
	}

	// Now wipe the weight and recipes tables to simulate disaster.
	if _, err := database.DB.Exec(`DELETE FROM weight_entries`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.DB.Exec(`DELETE FROM recipes`); err != nil {
		t.Fatal(err)
	}
	// Replace images with "new" content that should be overwritten.
	if err := os.WriteFile(filepath.Join(imgDir, "1_v_abc_original.jpg"), []byte("post-backup"), 0644); err != nil {
		t.Fatal(err)
	}

	// Build a request to restore item.Filename and run the handler. Set the
	// PathValue explicitly because httptest requests don't route through the
	// real mux which populates PathValue.
	req := httptest.NewRequest("POST", "/api/backups/"+item.Filename+"/restore", nil)
	req.SetPathValue("name", item.Filename)
	rr := httptest.NewRecorder()
	handler := withTestAdminRestore(http.HandlerFunc(HandleRestoreBackup))
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("restore returned %d: %s", rr.Code, rr.Body.String())
	}

	// Verify the weight row is back.
	var kg float64
	if err := database.DB.QueryRow(`SELECT weight_kg FROM weight_entries WHERE date = '2026-11-08'`).Scan(&kg); err != nil {
		t.Fatalf("weight row not restored: %v", err)
	}
	if kg != 80.5 {
		t.Errorf("expected 80.5 kg restored, got %v", kg)
	}
	// Verify the recipe row is back.
	var name string
	if err := database.DB.QueryRow(`SELECT name FROM recipes WHERE name = 'Test curry'`).Scan(&name); err != nil {
		t.Fatalf("recipe not restored: %v", err)
	}
	// Verify the image file was restored to its pre-backup content.
	content, err := os.ReadFile(filepath.Join(imgDir, "1_v_abc_original.jpg"))
	if err != nil {
		t.Fatalf("read image: %v", err)
	}
	if string(content) != "fake-original" {
		t.Errorf("expected restored image content 'fake-original', got %q", string(content))
	}
	// Verify a "before restore" safety backup was created.
	entries, err := os.ReadDir(backups)
	if err != nil {
		t.Fatal(err)
	}
	var beforeCount int
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), backupFilePrefixBefore) {
			beforeCount++
		}
	}
	if beforeCount < 1 {
		t.Errorf("expected at least one before-restore backup, got %d", beforeCount)
	}
}

func TestInvalidUploadIsRejected(t *testing.T) {
	dir, _, imgDir := setupBackupTestDB(t)
	backups := filepath.Join(dir, "backups")
	backupDirOverride = backups
	recipeImageDirOverride = imgDir
	t.Cleanup(func() { backupDirOverride = ""; recipeImageDirOverride = "" })
	if err := os.MkdirAll(backups, 0755); err != nil {
		t.Fatal(err)
	}
	installAdmin(t, "admin@example.com")

	// Build a multipart upload of a non-zip file.
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("backup", "garbage.zip")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("not actually a zip")); err != nil {
		t.Fatal(err)
	}
	mw.Close()

	req := httptest.NewRequest("POST", "/api/backups/upload-restore", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rr := httptest.NewRecorder()
	handler := withTestAdminRestore(http.HandlerFunc(HandleUploadRestore))
	handler.ServeHTTP(rr, req)
	if rr.Code == http.StatusOK {
		t.Errorf("expected non-200 for invalid upload, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err == nil {
		t.Logf("rejection message: %v", resp["error"])
	}
}

// withTestAdminRestore wraps a handler with a context that reports
// admin@example.com as the authenticated email. It duplicates the small
// context-setting the real auth middlewares do, by importing the auth package
// properly below.
func withTestAdminRestore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(authSetEmail(r.Context(), "admin@example.com"))
		next.ServeHTTP(w, r)
	})
}
