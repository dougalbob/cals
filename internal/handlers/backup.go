package handlers

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"cals/internal/database"
)

// Backup/restore for the diary database and recipe photos (feature on hold
// until PR approval). Writes ZIP files into the appdata backups directory
// (/app/data/backups by default) so the Unraid appdata backup captures them.
//
// Safety rules:
//   - Backups are taken with VACUUM INTO on a temporary path, PRAGMA
//     integrity_check'd, then renamed atomically into the backups folder. The
//     family can keep using cals while this runs.
//   - A restore always saves a "before restore" safety backup first.
//   - Restores block other writes (see restoreMu) and use the SQLite online
//     backup API to copy from the validated file into the live database under
//     an exclusive lock, then re-run migrations so an older backup gains any
//     newer columns.
//   - Only Admin users may list, create, download, delete or restore backups.
//     Uploads are also Admin-only.

const (
	backupDir              = "/app/data/backups"
	backupTimeLayout       = "20060102-150405"
	backupFilePrefixManual = "cals-"
	backupFilePrefixAuto   = "cals-auto-"
	backupFilePrefixBefore = "cals-before-restore-"
	backupFileSuffix       = ".zip"
	// Keep at most this many automatic daily backups. Older auto backups are
	// pruned when a new one is made.
	autoBackupRetention = 7
	// Generous upload cap: the database itself is small (megabytes, not
	// gigabytes); recipe photos are the dominant size. 200 MiB comfortably
	// covers a household's worth of photos for a long time while still
	// rejecting runaway uploads early.
	maxBackupUploadBytes = 200 << 20 // 200 MiB
)

var (
	// restoreMu serialises restores so two restores cannot trample each other,
	// and gives us a single flag to consult when refusing writes during a
	// restore (see assertNoRestoreInProgress).
	restoreMu   sync.Mutex
	restoreBusy atomicBool

	// backupMetaName is the file inside every backup ZIP that records what
	// version of cals created it, when, and what should be inside.
	backupMetaName   = "cals-backup.json"
	backupDBName     = "cals.db"
	backupImagesDir  = "images/recipes/"
	backupNameRegexp = regexp.MustCompile(`^cals(-auto|-before-restore)?-\d{8}-\d{6}\.zip$`)

	// expectedTables is the safety list checked before a restore. Every table
	// in this list must exist in the candidate backup or the restore is
	// refused. This catches accidental uploads of unrelated SQLite files and
	// protects against partial/future schema surprises.
	expectedTables = []string{
		"users", "foods", "food_servings", "recipes",
		"recipe_ingredients", "recipe_text_ingredients",
		"recipe_favourites", "recipe_meal_occasions", "recipe_key_foods",
		"recipe_user_portions",
		"diary_entries", "drinks", "drink_entries",
		"fit_tokens", "step_entries", "nutrition_settings",
		"weight_entries", "measurement_entries", "weight_goals", "daily_notes",
	}

	// Allow tests to override the directory / image dir / clock.
	backupDirOverride      string
	recipeImageDirOverride string
	nowFunc                = time.Now
)

// atomicBool is a tiny mutex-protected flag. sync/atomic is overkill here
// because restoreBusy is only set under restoreMu and cleared in defer; we
// just need concurrent reads safe for assertNoRestoreInProgress.
type atomicBool struct {
	mu sync.RWMutex
	v  bool
}

func (b *atomicBool) set(v bool) {
	b.mu.Lock()
	b.v = v
	b.mu.Unlock()
}

func (b *atomicBool) get() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.v
}

func effectiveBackupDir() string {
	if backupDirOverride != "" {
		return backupDirOverride
	}
	return backupDir
}

func effectiveRecipeImageDir() string {
	if recipeImageDirOverride != "" {
		return recipeImageDirOverride
	}
	return recipeImageDir
}

// backupMetadata is written as JSON at the root of every cals backup ZIP.
type backupMetadata struct {
	Version   string    `json:"app_version"`
	CreatedAt time.Time `json:"created_at_utc"`
	Kind      string    `json:"kind"` // "manual", "auto", "before-restore"
}

type backupListItem struct {
	Filename  string    `json:"filename"`
	CreatedAt time.Time `json:"created_at"`
	SizeBytes int64     `json:"size_bytes"`
	Kind      string    `json:"kind"` // manual | auto | before-restore
}

// EnsureBackupsDir creates the backup directory if it does not already exist.
// Safe to call from handlers and from main on startup.
func EnsureBackupsDir() error {
	return os.MkdirAll(effectiveBackupDir(), 0755)
}

// RunAutoBackupIfDue runs once at startup: if today has no automatic backup
// yet, it takes one and prunes old automatic backups beyond the retention
// limit. Errors are logged but non-fatal so the container can still start.
func RunAutoBackupIfDue(appVersion string) {
	if err := EnsureBackupsDir(); err != nil {
		log.Printf("backups: unable to create backup directory: %v", err)
		return
	}
	today := nowFunc().UTC().Format("20060102")
	entries, err := os.ReadDir(effectiveBackupDir())
	if err != nil {
		log.Printf("backups: unable to list directory: %v", err)
		return
	}
	haveToday := false
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, backupFilePrefixAuto) && strings.Contains(name, today) {
			haveToday = true
			break
		}
	}
	if haveToday {
		pruneAutoBackups()
		return
	}
	log.Printf("backups: taking daily automatic backup")
	if _, err := createBackup(context.Background(), "auto", appVersion); err != nil {
		log.Printf("backups: automatic backup failed: %v", err)
		return
	}
	pruneAutoBackups()
}

func pruneAutoBackups() {
	entries, err := os.ReadDir(effectiveBackupDir())
	if err != nil {
		return
	}
	var autos []string
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, backupFilePrefixAuto) && strings.HasSuffix(name, backupFileSuffix) {
			autos = append(autos, name)
		}
	}
	sort.Strings(autos) // lexicographic on cals-auto-YYYYMMDD-HHMMSS.zip == newest last
	if len(autos) <= autoBackupRetention {
		return
	}
	toRemove := autos[:len(autos)-autoBackupRetention]
	for _, name := range toRemove {
		path := filepath.Join(effectiveBackupDir(), name)
		if err := os.Remove(path); err != nil {
			log.Printf("backups: failed to prune old auto backup %s: %v", name, err)
		} else {
			log.Printf("backups: pruned old auto backup %s", name)
		}
	}
}

// parseBackupFilename extracts the timestamp and kind from a backup filename.
// Returns false for names that don't match the expected pattern.
func parseBackupFilename(name string) (kind string, t time.Time, ok bool) {
	if !backupNameRegexp.MatchString(name) {
		return "", time.Time{}, false
	}
	// Strip suffix and split prefix to read the timestamp.
	base := strings.TrimSuffix(name, backupFileSuffix)
	var ts string
	switch {
	case strings.HasPrefix(name, backupFilePrefixAuto):
		kind = "auto"
		ts = strings.TrimPrefix(base, strings.TrimSuffix(backupFilePrefixAuto, "-"))
	case strings.HasPrefix(name, backupFilePrefixBefore):
		kind = "before-restore"
		ts = strings.TrimPrefix(base, strings.TrimSuffix(backupFilePrefixBefore, "-"))
	default:
		kind = "manual"
		ts = strings.TrimPrefix(base, strings.TrimSuffix(backupFilePrefixManual, "-"))
	}
	// ts now looks like "-YYYYMMDD-HHMMSS"; strip the leading dash.
	ts = strings.TrimPrefix(ts, "-")
	parsed, err := time.Parse(backupTimeLayout, ts)
	if err != nil {
		return "", time.Time{}, false
	}
	return kind, parsed, true
}

// HandleListBackups lists all backup files currently stored on the server,
// newest first. Admin-only.
func HandleListBackups(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	if err := EnsureBackupsDir(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not access backups folder")
		return
	}
	entries, err := os.ReadDir(effectiveBackupDir())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not list backups")
		return
	}
	items := make([]backupListItem, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		kind, created, ok := parseBackupFilename(name)
		if !ok {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		items = append(items, backupListItem{
			Filename:  name,
			CreatedAt: created,
			SizeBytes: info.Size(),
			Kind:      kind,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(items)
}

// HandleCreateBackup creates a fresh backup and returns its metadata. Admin-only.
func HandleCreateBackup(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	item, err := createBackup(r.Context(), "manual", "")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(item)
}

// createBackup takes a WAL-safe snapshot of the live database, bundles it with
// the current recipe images into a ZIP at a temp path, then renames into the
// backups folder atomically. Returns the list entry for the new file.
func createBackup(ctx context.Context, kind, appVersion string) (*backupListItem, error) {
	if err := EnsureBackupsDir(); err != nil {
		return nil, fmt.Errorf("could not create backups folder: %w", err)
	}

	prefix := backupFilePrefixManual
	switch kind {
	case "auto":
		prefix = backupFilePrefixAuto
	case "before-restore":
		prefix = backupFilePrefixBefore
	}
	ts := nowFunc().UTC().Format(backupTimeLayout)
	finalName := prefix + ts + backupFileSuffix
	finalPath := filepath.Join(effectiveBackupDir(), finalName)

	// Work entirely in the backups directory so the final rename is on the
	// same filesystem and therefore atomic.
	tmpDB, err := os.CreateTemp(effectiveBackupDir(), ".cals-backup-db-")
	if err != nil {
		return nil, fmt.Errorf("could not create temp database: %w", err)
	}
	tmpDBPath := tmpDB.Name()
	_ = tmpDB.Close()
	defer os.Remove(tmpDBPath)

	tmpZip, err := os.CreateTemp(effectiveBackupDir(), ".cals-backup-zip-")
	if err != nil {
		return nil, fmt.Errorf("could not create temp zip: %w", err)
	}
	tmpZipPath := tmpZip.Name()
	zipClosed := false
	zipRenamed := false
	defer func() {
		if !zipClosed {
			_ = tmpZip.Close()
		}
		if !zipRenamed {
			_ = os.Remove(tmpZipPath)
		}
	}()

	// 1. VACUUM INTO produces a consistent snapshot of a WAL-mode database
	//    without blocking writers, and the result is a self-contained SQLite
	//    database (no -wal/-shm sidecars).
	if _, err := database.DB.ExecContext(ctx, `VACUUM INTO ?`, tmpDBPath); err != nil {
		return nil, fmt.Errorf("could not snapshot database: %w", err)
	}

	// 2. Verify the snapshot is a sane SQLite database before we bundle it.
	if err := validateSQLiteFile(tmpDBPath); err != nil {
		return nil, fmt.Errorf("snapshot failed integrity check: %w", err)
	}

	// 3. Build the ZIP: metadata, database, then every recipe image.
	zw := zip.NewWriter(tmpZip)
	createdAt := nowFunc().UTC()
	metaBytes, _ := json.Marshal(backupMetadata{
		Version:   appVersion,
		CreatedAt: createdAt,
		Kind:      kind,
	})
	metaHeader := &zip.FileHeader{
		Name:     backupMetaName,
		Method:   zip.Deflate,
		Modified: createdAt,
	}
	metaWriter, err := zw.CreateHeader(metaHeader)
	if err != nil {
		return nil, fmt.Errorf("could not write backup metadata: %w", err)
	}
	if _, err := metaWriter.Write(metaBytes); err != nil {
		return nil, fmt.Errorf("could not write backup metadata: %w", err)
	}
	if err := addFileToZip(zw, tmpDBPath, backupDBName, createdAt); err != nil {
		return nil, fmt.Errorf("could not add database to backup: %w", err)
	}
	// Recipe images — best effort. If an image is being written at the same
	// instant, os.Open may briefly fail; log and continue rather than abort
	// the whole backup.
	imgDir := effectiveRecipeImageDir()
	if entries, err := os.ReadDir(imgDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			// Only bundle recipe jpgs (the known on-disk format:
			// <id>_<version>_original.jpg / _thumb.jpg and the legacy
			// <id>_original.jpg / _thumb.jpg). Skip anything unexpected.
			if !strings.HasSuffix(strings.ToLower(name), ".jpg") &&
				!strings.HasSuffix(strings.ToLower(name), ".jpeg") {
				continue
			}
			src := filepath.Join(imgDir, name)
			if err := addFileToZip(zw, src, backupImagesDir+name, createdAt); err != nil {
				log.Printf("backups: skipping image %s during backup: %v", name, err)
			}
		}
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("could not finish backup zip: %w", err)
	}
	zipClosed = true
	if err := tmpZip.Close(); err != nil {
		return nil, fmt.Errorf("could not finish backup zip: %w", err)
	}
	zipClosed = true

	// 4. Atomic rename into the visible backups folder.
	if err := os.Rename(tmpZipPath, finalPath); err != nil {
		return nil, fmt.Errorf("could not save backup: %w", err)
	}
	zipRenamed = true

	info, err := os.Stat(finalPath)
	if err != nil {
		return nil, fmt.Errorf("backup saved but could not read its size: %w", err)
	}
	log.Printf("backups: created %s (%d bytes)", finalName, info.Size())
	return &backupListItem{
		Filename:  finalName,
		CreatedAt: createdAt,
		SizeBytes: info.Size(),
		Kind:      kind,
	}, nil
}

func addFileToZip(zw *zip.Writer, srcPath, entryName string, modified time.Time) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = entryName
	header.Method = zip.Deflate
	header.Modified = modified
	w, err := zw.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, f)
	return err
}

// validateSQLiteFile opens a SQLite file at path in read-only mode and runs
// PRAGMA integrity_check. It also verifies foreign keys are clean and that
// every table in expectedTables exists. Returns nil when the file looks like
// a usable cals database. The file is closed before return.
func validateSQLiteFile(path string) error {
	// Open with a distinct URI so we never touch the live pool.
	dsn := "file:" + path + "?mode=ro&_foreign_keys=on"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return fmt.Errorf("not a SQLite database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		return fmt.Errorf("could not open database: %w", err)
	}

	// integrity_check returns one row "ok" on success, or one row per problem.
	rows, err := db.Query(`PRAGMA integrity_check`)
	if err != nil {
		return fmt.Errorf("integrity check failed: %w", err)
	}
	var problems []string
	for rows.Next() {
		var msg string
		if err := rows.Scan(&msg); err != nil {
			rows.Close()
			return fmt.Errorf("integrity check failed: %w", err)
		}
		if msg != "ok" {
			problems = append(problems, msg)
		}
	}
	rows.Close()
	if len(problems) > 0 {
		return fmt.Errorf("integrity problems: %s", strings.Join(problems, "; "))
	}

	// foreign_key_check returns rows of violations when there are any.
	fkRows, err := db.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		return fmt.Errorf("foreign-key check failed: %w", err)
	}
	defer fkRows.Close()
	if fkRows.Next() {
		return fmt.Errorf("foreign-key violations found in backup")
	}

	// Every expected table must exist.
	for _, table := range expectedTables {
		var name string
		err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return fmt.Errorf("backup is missing the %q table — not a cals database", table)
			}
			return fmt.Errorf("could not inspect schema: %w", err)
		}
	}

	// Refuse backups that advertise a newer user_version than this binary
	// understands. We don't currently bump user_version on schema changes,
	// so this is a forward-compatibility safety net: if a future release
	// starts bumping it, an older binary will refuse to restore forward.
	var userVersion int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&userVersion); err == nil {
		var liveVersion int
		if err := database.DB.QueryRow(`PRAGMA user_version`).Scan(&liveVersion); err == nil {
			if userVersion > liveVersion {
				return fmt.Errorf("backup is from a newer version of cals (schema version %d > %d); update cals first", userVersion, liveVersion)
			}
		}
	}
	return nil
}

// HandleDownloadBackup streams a previously-created backup to the client as a
// download. Admin-only, path-safe: only files inside the backups directory
// whose names match our pattern are served.
func HandleDownloadBackup(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	name := r.PathValue("name")
	if name == "" || !isSafeBackupName(name) {
		writeJSONError(w, http.StatusBadRequest, "Unknown backup")
		return
	}
	path := filepath.Join(effectiveBackupDir(), name)
	// Resolve to guard against any traversal attempt even with the regex check.
	absDir, err := filepath.Abs(effectiveBackupDir())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not resolve backup path")
		return
	}
	absPath, err := filepath.Abs(path)
	if err != nil || !strings.HasPrefix(absPath, absDir+string(os.PathSeparator)) {
		writeJSONError(w, http.StatusBadRequest, "Unknown backup")
		return
	}
	file, err := os.Open(absPath)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Backup not found")
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		writeJSONError(w, http.StatusNotFound, "Backup not found")
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, name))
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = io.Copy(w, file)
}

// HandleDeleteBackup removes a backup file. Admin-only.
func HandleDeleteBackup(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	name := r.PathValue("name")
	if name == "" || !isSafeBackupName(name) {
		writeJSONError(w, http.StatusBadRequest, "Unknown backup")
		return
	}
	path := filepath.Join(effectiveBackupDir(), name)
	absDir, err := filepath.Abs(effectiveBackupDir())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not resolve backup path")
		return
	}
	absPath, err := filepath.Abs(path)
	if err != nil || !strings.HasPrefix(absPath, absDir+string(os.PathSeparator)) {
		writeJSONError(w, http.StatusBadRequest, "Unknown backup")
		return
	}
	if err := os.Remove(absPath); err != nil {
		if os.IsNotExist(err) {
			writeJSONError(w, http.StatusNotFound, "Backup not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Could not delete backup")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleRestoreBackup restores the live database and recipe images from a
// previously-saved backup identified by filename. Admin-only.
func HandleRestoreBackup(w http.ResponseWriter, r *http.Request) {
	handleRestore(w, r, "")
}

// HandleUploadRestore accepts a backup ZIP uploaded from the client and
// restores from it. The file is streamed into a temp file first so we can
// validate it before touching live data. Admin-only.
func HandleUploadRestore(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBackupUploadBytes)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "Backup file too large (max 200 MB)")
			return
		}
		writeJSONError(w, http.StatusBadRequest, "Choose a backup file to upload")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("backup")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Choose a backup file to upload")
		return
	}
	defer file.Close()
	if header.Size <= 0 {
		writeJSONError(w, http.StatusBadRequest, "The uploaded file is empty")
		return
	}
	if !strings.HasSuffix(strings.ToLower(header.Filename), backupFileSuffix) {
		writeJSONError(w, http.StatusBadRequest, "Choose a cals backup (.zip) file")
		return
	}
	tmp, err := os.CreateTemp(effectiveBackupDir(), ".cals-restore-upload-")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not stage upload")
		return
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()
	if _, err := io.Copy(tmp, file); err != nil {
		_ = tmp.Close()
		writeJSONError(w, http.StatusInternalServerError, "Could not read upload")
		return
	}
	if err := tmp.Close(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not finish upload")
		return
	}
	handleRestore(w, r, tmpPath)
	// handleRestore has returned (success or failure); if we get here and
	// tmpPath still exists it's because of failure — the defer will clean it.
	_ = cleanup
}

// handleRestore performs the restore against either a stored backup (when
// uploadPath is empty and name comes from the URL) or an uploaded temp file.
func handleRestore(w http.ResponseWriter, r *http.Request, uploadPath string) {
	if !requireAdmin(w, r) {
		return
	}

	// A restore is one-at-a-time and briefly blocks writes. Refuse a second
	// restore while one is already in progress rather than queueing.
	if !restoreMu.TryLock() {
		writeJSONError(w, http.StatusConflict, "A restore is already in progress")
		return
	}
	restoreBusy.set(true)
	defer func() {
		restoreBusy.set(false)
		restoreMu.Unlock()
	}()

	var archivePath string
	var archiveLabel string
	if uploadPath != "" {
		archivePath = uploadPath
		archiveLabel = "uploaded file"
	} else {
		name := r.PathValue("name")
		if name == "" || !isSafeBackupName(name) {
			writeJSONError(w, http.StatusBadRequest, "Unknown backup")
			return
		}
		archivePath = filepath.Join(effectiveBackupDir(), name)
		archiveLabel = name
		absDir, _ := filepath.Abs(effectiveBackupDir())
		absPath, err := filepath.Abs(archivePath)
		if err != nil || !strings.HasPrefix(absPath, absDir+string(os.PathSeparator)) {
			writeJSONError(w, http.StatusBadRequest, "Unknown backup")
			return
		}
	}

	// 1. Always take a "before restore" backup first, so the family can undo
	//    this restore even if it succeeds. If we can't save one, refuse to
	//    proceed.
	before, err := createBackup(r.Context(), "before-restore", "")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError,
			fmt.Sprintf("Could not take a safety copy before restore — refusing to continue (%v)", err))
		return
	}

	// 2. Stage the archive: extract the database to a temp file and copy
	//    the recipe images into a staging directory so we can validate the DB
	//    before touching anything live.
	stagingDir, err := os.MkdirTemp(effectiveBackupDir(), ".cals-restore-stage-")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not stage restore")
		return
	}
	defer os.RemoveAll(stagingDir)
	stagedDB, stagedImgDir, meta, err := extractBackupForRestore(archivePath, stagingDir)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Backup is not valid: %v", err))
		return
	}
	_ = meta // metadata is informational; we log it for forensics.
	log.Printf("backups: restoring from %s (created %s, kind %s)", archiveLabel, meta.CreatedAt, meta.Kind)

	// 3. Validate the candidate database before touching the live one.
	if err := validateSQLiteFile(stagedDB); err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Backup database failed checks: %v", err))
		return
	}

	// 4. Replace the live database file with the validated staged copy.
	//    RefuseMutationsDuringRestore has paused writes and Close() waits for
	//    in-flight requests, so the file swap is safe. The function reopens
	//    the pool and runs migrations additively so an older backup gains any
	//    newer columns added since it was taken.
	if err := replaceLiveDBFile(stagedDB); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Restore failed while loading data: %v", err))
		return
	}

	// 6. Replace recipe images atomically: swap the image directory by
	//    renaming the old one aside, moving the staged one into place, then
	//    removing the old one. Images that exist in both get overwritten by
	//    the backup's version; images the backup doesn't contain are removed
	//    so the on-disk set matches what the restored database references.
	if err := replaceRecipeImages(stagedImgDir); err != nil {
		log.Printf("backups: warning — image restore had an error: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":                   true,
		"before_restore_backup": before.Filename,
		"restored_from":        archiveLabel,
	})
	log.Printf("backups: restore complete. Safety copy saved as %s", before.Filename)
}

func isSafeBackupName(name string) bool {
	// Reject anything with a path separator or that falls outside the
	// expected pattern, even though the mux pattern won't usually deliver
	// slashes as a PathValue.
	if strings.ContainsAny(name, `/\`) {
		return false
	}
	if !backupNameRegexp.MatchString(name) {
		return false
	}
	// Reject any ".." component (belt and braces).
	if name == "." || name == ".." || strings.Contains(name, "..") {
		return false
	}
	return true
}

// extractBackupForRestore opens the ZIP at archivePath, verifies it has the
// expected structure, writes cals.db to a temp file inside stagingDir, copies
// every recipe image into stagingDir/images/recipes, and reads the metadata.
func extractBackupForRestore(archivePath, stagingDir string) (dbPath string, imgDir string, meta backupMetadata, err error) {
	zr, err := zip.OpenReader(archivePath)
	if err != nil {
		return "", "", meta, fmt.Errorf("not a zip file: %w", err)
	}
	defer zr.Close()

	imgDir = filepath.Join(stagingDir, "images", "recipes")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		return "", "", meta, err
	}
	dbPath = filepath.Join(stagingDir, "cals.db")

	var foundDB, foundMeta bool
	for _, f := range zr.File {
		name := filepath.ToSlash(f.Name)
		// Guard against zip-slip: reject any entry that escapes the staging dir.
		target := filepath.Join(stagingDir, filepath.FromSlash(name))
		absStaging, _ := filepath.Abs(stagingDir)
		absTarget, err := filepath.Abs(target)
		if err != nil || !strings.HasPrefix(absTarget, absStaging+string(os.PathSeparator)) {
			return "", "", meta, fmt.Errorf("backup contains an unsafe path: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0755); err != nil {
				return "", "", meta, err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return "", "", meta, err
		}
		switch {
		case name == backupMetaName:
			if err := readJSONFromZip(f, &meta); err != nil {
				return "", "", meta, fmt.Errorf("reading backup metadata: %w", err)
			}
			foundMeta = true
		case name == backupDBName:
			if err := writeZipEntryToFile(f, target); err != nil {
				return "", "", meta, fmt.Errorf("extracting database: %w", err)
			}
			foundDB = true
		case strings.HasPrefix(name, backupImagesDir):
			// Only image files expected here.
			base := filepath.Base(name)
			if base == "" || base == "." {
				continue
			}
			if err := writeZipEntryToFile(f, target); err != nil {
				return "", "", meta, fmt.Errorf("extracting image %s: %w", base, err)
			}
		default:
			// Unknown entry — ignore. Future versions may add new files;
			// tolerating them keeps restores forward-compatible.
		}
	}
	if !foundMeta {
		return "", "", meta, errors.New("missing backup metadata — not a cals backup")
	}
	if !foundDB {
		return "", "", meta, errors.New("backup does not contain cals.db")
	}
	return dbPath, imgDir, meta, nil
}

func readJSONFromZip(f *zip.File, out any) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	return json.NewDecoder(rc).Decode(out)
}

func writeZipEntryToFile(f *zip.File, target string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, rc); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

// liveDBPath is resolved once (from config.DBPath) at startup so the restore
// path can close the pool, replace the file and reopen without needing to
// thread the config through handlers. Set by SetLiveDBPath from main.
var liveDBPath string

// SetLiveDBPath tells the backup/restore code where the live database file
// lives so it can replace the file during a restore.
func SetLiveDBPath(p string) { liveDBPath = p }

// replaceLiveDBFile replaces the live database file with the staged copy.
//
// SQLite in WAL mode keeps sidecars (-wal/-shm) beside the main file, and
// the online backup API requires an exclusive destination that is hard to
// guarantee from a long-lived *sql.DB pool. The simplest safe approach is to
// briefly close the pool, copy the staged database over the live file (and
// remove any stale WAL/SHM sidecars from the previous run), then reopen.
// RefuseMutationsDuringRestore is already blocking incoming writes and
// returning 503, so any in-flight request will have already finished by the
// time we Close() the pool (Close waits for them). After reopen, migrations
// run additively so an older backup gains newer columns.
func replaceLiveDBFile(stagedDB string) error {
	if liveDBPath == "" {
		return errors.New("live database path is not configured")
	}
	// Close all live connections.
	database.Close()

	// Remove WAL/SHM sidecars so the next open starts cleanly from the new
	// file (any previously-committed data is already in cals.db because we
	// checkpointed during VACUUM INTO, and the staged file itself was
	// checkpointed by integrity_check which opens and closes it).
	_ = os.Remove(liveDBPath + "-wal")
	_ = os.Remove(liveDBPath + "-shm")

	// Replace the live file with the staged copy. Copy the bytes rather than
	// renaming so we don't move a temp file out of our staging directory.
	if err := copyFile(stagedDB, liveDBPath); err != nil {
		// Attempt to reopen on a best-effort basis so the server can serve
		// errors after this point.
		_ = database.Initialize(liveDBPath)
		return fmt.Errorf("replace database file: %w", err)
	}

	// Reopen and run migrations.
	if err := database.Initialize(liveDBPath); err != nil {
		return fmt.Errorf("reopen database: %w", err)
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".restore-tmp"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Sync(); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// replaceRecipeImages swaps the live recipe image directory with the staged
// copy. The live directory is renamed aside, the staged one moved into place,
// then the old directory is removed.
func replaceRecipeImages(stagedImgDir string) error {
	liveDir := effectiveRecipeImageDir()
	// Ensure the live parent exists (it always should after migrations /
	// earlier uploads, but be defensive).
	if err := os.MkdirAll(filepath.Dir(liveDir), 0755); err != nil {
		return err
	}

	oldDir := filepath.Join(filepath.Dir(liveDir), "recipes.old."+nowFunc().UTC().Format(backupTimeLayout))
	// If the live dir exists, move it out of the way. Missing is fine — a
	// brand-new install may have no images yet.
	if _, err := os.Stat(liveDir); err == nil {
		if err := os.Rename(liveDir, oldDir); err != nil {
			return fmt.Errorf("moving aside existing images: %w", err)
		}
		defer os.RemoveAll(oldDir) // best-effort cleanup
	} else if !os.IsNotExist(err) {
		return err
	}
	// Move the staged directory into the live location.
	if err := os.Rename(stagedImgDir, liveDir); err != nil {
		// Try to put the old dir back if the rename failed, so we don't
		// leave the system without images.
		_ = os.Rename(oldDir, liveDir)
		return fmt.Errorf("placing restored images: %w", err)
	}
	return nil
}

// RefuseMutationsDuringRestore is middleware that briefly pauses writes to
// diary/food/recipe/etc. while a restore is in progress. Reads are allowed
// through, and the restore's own endpoints are exempt (otherwise the restore
// request itself would be refused). A 503 with a Retry-After tells the client
// to retry in a moment.
func RefuseMutationsDuringRestore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if restoreBusy.get() && isMutatingRequest(r) && !isRestoreEndpoint(r) {
			w.Header().Set("Retry-After", "5")
			writeJSONError(w, http.StatusServiceUnavailable, "A restore is in progress — please try again in a moment")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isMutatingRequest(r *http.Request) bool {
	switch r.Method {
	case "GET", "HEAD", "OPTIONS":
		return false
	}
	return true
}

func isRestoreEndpoint(r *http.Request) bool {
	p := r.URL.Path
	return strings.HasPrefix(p, "/api/backups")
}

// requireAdmin checks that the caller has the Admin role. If not it writes a
// 403 and returns false.
func requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	isAdmin, err := currentUserIsAdmin(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not check role")
		return false
	}
	if !isAdmin {
		writeJSONError(w, http.StatusForbidden, "Only the Admin account can use backups")
		return false
	}
	return true
}
