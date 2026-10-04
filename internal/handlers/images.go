package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"

	"cals/internal/database"
)

const (
	maxImageSize        = 10 << 20                 // 10 MiB per image
	maxImageRequestSize = maxImageSize + (1 << 20) // allow multipart headers around the file
	maxImagePixels      = int64(40_000_000)
	thumbMaxDimension   = 400
	imageVersionPrefix  = "v_"
)

// Images live beside the database in the persistent /app/data volume. The
// variable is replaceable by tests so they never write to a developer's data.
var recipeImageDir = "/app/data/images/recipes"

type recipeImageUploadResponse struct {
	Filename  string    `json:"filename"`
	UpdatedAt time.Time `json:"updated_at"`
}

// HandleUploadRecipeImage stores a JPEG, PNG or WebP recipe photo and a
// 400-pixel thumbnail. Uploading again replaces the current photo. Files are
// versioned and the database pointer is switched only after both new files are
// safely written, so a failed replacement leaves the old image intact.
func HandleUploadRecipeImage(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	var previousImage sql.NullString
	if err := database.DB.QueryRow(
		`SELECT image_filename FROM recipes WHERE id = ?`, id,
	).Scan(&previousImage); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "Recipe not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Could not read recipe")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxImageRequestSize)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "Image too large (max 10 MB)")
			return
		}
		writeJSONError(w, http.StatusBadRequest, "Choose an image to upload")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Choose an image to upload")
		return
	}
	defer file.Close()

	if header.Size <= 0 {
		writeJSONError(w, http.StatusBadRequest, "The selected image is empty")
		return
	}
	if header.Size > maxImageSize {
		writeJSONError(w, http.StatusRequestEntityTooLarge, "Image too large (max 10 MB)")
		return
	}

	config, format, err := image.DecodeConfig(file)
	if err != nil || !supportedRecipeImageFormat(format) {
		writeJSONError(w, http.StatusBadRequest, "Choose a valid JPEG, PNG or WebP image")
		return
	}
	if config.Width <= 0 || config.Height <= 0 ||
		int64(config.Width) > maxImagePixels/int64(config.Height) {
		writeJSONError(w, http.StatusBadRequest, "Image dimensions are too large")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Could not read the selected image")
		return
	}

	img, format, err := image.Decode(file)
	if err != nil || !supportedRecipeImageFormat(format) {
		writeJSONError(w, http.StatusBadRequest, "Choose a valid JPEG, PNG or WebP image")
		return
	}

	if err := os.MkdirAll(recipeImageDir, 0755); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not save recipe image")
		return
	}

	version, err := newRecipeImageVersion()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not save recipe image")
		return
	}
	originalPath, thumbPath, err := writeRecipeImageFiles(id, version, img)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not save recipe image")
		return
	}

	updatedAt := time.Now().UTC()
	result, err := database.DB.Exec(`
		UPDATE recipes
		SET image_filename = ?, updated_at = ?
		WHERE id = ?
	`, version, updatedAt, id)
	if err != nil {
		removeRecipeImageFiles(originalPath, thumbPath)
		writeJSONError(w, http.StatusInternalServerError, "Could not save recipe image")
		return
	}
	if affected, rowsErr := result.RowsAffected(); rowsErr == nil && affected == 0 {
		removeRecipeImageFiles(originalPath, thumbPath)
		writeJSONError(w, http.StatusNotFound, "Recipe not found")
		return
	}

	// Old files are no longer reachable after the database pointer changes.
	// Cleanup is best-effort; an unlink failure only leaves an unused file.
	if previousImage.Valid && previousImage.String != version {
		removeRecipeImageVersion(id, previousImage.String)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(recipeImageUploadResponse{
		Filename:  version,
		UpdatedAt: updatedAt,
	})
}

func supportedRecipeImageFormat(format string) bool {
	return format == "jpeg" || format == "png" || format == "webp"
}

func newRecipeImageVersion() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return imageVersionPrefix + hex.EncodeToString(random), nil
}

func validRecipeImageVersion(version string) bool {
	if len(version) != len(imageVersionPrefix)+32 || version[:len(imageVersionPrefix)] != imageVersionPrefix {
		return false
	}
	for _, digit := range version[len(imageVersionPrefix):] {
		if !(digit >= '0' && digit <= '9') && !(digit >= 'a' && digit <= 'f') {
			return false
		}
	}
	return true
}

func writeRecipeImageFiles(recipeID int64, version string, img image.Image) (string, string, error) {
	originalPath := filepath.Join(recipeImageDir, fmt.Sprintf("%d_%s_original.jpg", recipeID, version))
	thumbPath := filepath.Join(recipeImageDir, fmt.Sprintf("%d_%s_thumb.jpg", recipeID, version))

	originalTemp, err := writeJPEGTemp(recipeImageDir, fmt.Sprintf(".%d-original-", recipeID), img, 90)
	if err != nil {
		return "", "", err
	}
	defer os.Remove(originalTemp)

	thumb := resizeImage(img, thumbMaxDimension)
	thumbTemp, err := writeJPEGTemp(recipeImageDir, fmt.Sprintf(".%d-thumb-", recipeID), thumb, 85)
	if err != nil {
		return "", "", err
	}
	defer os.Remove(thumbTemp)

	// Both files are fully encoded before either becomes visible. Since the
	// names are unique, failed installs can be removed without affecting the
	// recipe's currently referenced image.
	if err := os.Rename(originalTemp, originalPath); err != nil {
		return "", "", err
	}
	if err := os.Rename(thumbTemp, thumbPath); err != nil {
		_ = os.Remove(originalPath)
		return "", "", err
	}
	return originalPath, thumbPath, nil
}

func writeJPEGTemp(directory, prefix string, img image.Image, quality int) (string, error) {
	file, err := os.CreateTemp(directory, prefix)
	if err != nil {
		return "", err
	}
	path := file.Name()
	if err := jpeg.Encode(file, img, &jpeg.Options{Quality: quality}); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return "", err
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

func resizeImage(img image.Image, maxDimension int) image.Image {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= maxDimension && height <= maxDimension {
		return img
	}

	ratio := float64(maxDimension) / float64(max(width, height))
	newWidth := max(1, int(float64(width)*ratio))
	newHeight := max(1, int(float64(height)*ratio))
	dst := image.NewRGBA(image.Rect(0, 0, newWidth, newHeight))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
	return dst
}

func recipeImagePaths(recipeID int64, imageFilename, imageType string) (string, bool) {
	if imageType != "thumb" && imageType != "original" {
		return "", false
	}

	// Images uploaded before versioned storage used the recipe ID as the
	// filename, e.g. 12_original.jpg. Continue serving those files unchanged.
	if imageFilename == strconv.FormatInt(recipeID, 10) {
		return filepath.Join(recipeImageDir, fmt.Sprintf("%d_%s.jpg", recipeID, imageType)), true
	}
	if !validRecipeImageVersion(imageFilename) {
		return "", false
	}
	return filepath.Join(recipeImageDir, fmt.Sprintf("%d_%s_%s.jpg", recipeID, imageFilename, imageType)), true
}

func removeRecipeImageFiles(originalPath, thumbPath string) {
	_ = os.Remove(originalPath)
	_ = os.Remove(thumbPath)
}

func removeRecipeImageVersion(recipeID int64, imageFilename string) {
	originalPath, originalOK := recipeImagePaths(recipeID, imageFilename, "original")
	thumbPath, thumbOK := recipeImagePaths(recipeID, imageFilename, "thumb")
	if originalOK && thumbOK {
		removeRecipeImageFiles(originalPath, thumbPath)
	}
}

// HandleGetRecipeImage serves the current recipe image. A numeric
// image_filename is the pre-versioned on-disk format; new uploads use an
// unguessable version token so replacing an image also gives it a fresh cache
// key without a schema migration.
func HandleGetRecipeImage(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}
	imageType := r.PathValue("type")
	if imageType != "thumb" && imageType != "original" {
		writeJSONError(w, http.StatusBadRequest, "Invalid image type")
		return
	}

	var imageFilename sql.NullString
	err = database.DB.QueryRow(`SELECT image_filename FROM recipes WHERE id = ?`, id).Scan(&imageFilename)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "Recipe not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Could not read recipe image")
		return
	}
	if !imageFilename.Valid || imageFilename.String == "" {
		writeJSONError(w, http.StatusNotFound, "Image not found")
		return
	}

	path, ok := recipeImagePaths(id, imageFilename.String, imageType)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "Image not found")
		return
	}
	file, err := os.Open(path)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Image not found")
		return
	}
	defer file.Close()

	etag := fmt.Sprintf(`"%s-%s"`, imageFilename.String, imageType)
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, max-age=0, must-revalidate")
	w.Header().Set("ETag", etag)
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if _, err := io.Copy(w, file); err != nil {
		return
	}
}
