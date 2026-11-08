package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"cals/internal/database"
)

func useTemporaryRecipeImageDir(t *testing.T) string {
	t.Helper()
	previous := recipeImageDir
	recipeImageDir = t.TempDir()
	t.Cleanup(func() { recipeImageDir = previous })
	return recipeImageDir
}

func pngBytesForTest(t *testing.T, width, height int, fill color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, fill)
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, img); err != nil {
		t.Fatalf("encoding test PNG: %v", err)
	}
	return encoded.Bytes()
}

func uploadRecipeImageForTest(t *testing.T, recipeID int64, imageName string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if imageName != "" {
		part, err := writer.CreateFormFile("image", imageName)
		if err != nil {
			t.Fatalf("creating image form part: %v", err)
		}
		if _, err := part.Write(content); err != nil {
			t.Fatalf("writing test image: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("closing multipart form: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/recipes/"+strconv.FormatInt(recipeID, 10)+"/image", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.SetPathValue("id", strconv.FormatInt(recipeID, 10))
	recorder := httptest.NewRecorder()
	HandleUploadRecipeImage(recorder, req)
	return recorder
}

func serveRecipeImageForTest(t *testing.T, recipeID int64, imageType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/images/recipes/%d/%s", recipeID, imageType), nil)
	req.SetPathValue("id", strconv.FormatInt(recipeID, 10))
	req.SetPathValue("type", imageType)
	recorder := httptest.NewRecorder()
	HandleGetRecipeImage(recorder, req)
	return recorder
}

func TestUploadRecipeImageStoresOriginalThumbnailAndReplacesExistingImage(t *testing.T) {
	setupHandlerDB(t)
	imageDirectory := useTemporaryRecipeImageDir(t)
	creatorID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", creatorID)

	first := uploadRecipeImageForTest(t, recipeID, "curry.png", pngBytesForTest(t, 800, 600, color.RGBA{R: 220, G: 60, B: 40, A: 255}))
	if first.Code != http.StatusOK {
		t.Fatalf("first upload status = %d, body = %s", first.Code, first.Body.String())
	}
	var firstResponse recipeImageUploadResponse
	if err := json.NewDecoder(first.Body).Decode(&firstResponse); err != nil {
		t.Fatalf("decoding first upload response: %v", err)
	}
	if !validRecipeImageVersion(firstResponse.Filename) {
		t.Fatalf("first filename = %q, want a version token", firstResponse.Filename)
	}
	if firstResponse.UpdatedAt.IsZero() {
		t.Fatal("upload response should include updated_at")
	}

	var storedFilename string
	if err := database.DB.QueryRow(`SELECT image_filename FROM recipes WHERE id = ?`, recipeID).Scan(&storedFilename); err != nil {
		t.Fatalf("reading stored image filename: %v", err)
	}
	if storedFilename != firstResponse.Filename {
		t.Fatalf("stored image filename = %q, want %q", storedFilename, firstResponse.Filename)
	}

	firstOriginal := filepath.Join(imageDirectory, fmt.Sprintf("%d_%s_original.jpg", recipeID, firstResponse.Filename))
	firstThumb := filepath.Join(imageDirectory, fmt.Sprintf("%d_%s_thumb.jpg", recipeID, firstResponse.Filename))
	for _, path := range []string{firstOriginal, firstThumb} {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("expected uploaded file %q: %v", path, err)
		}
	}
	originalConfig, format, err := image.DecodeConfig(bytes.NewReader(mustReadFile(t, firstOriginal)))
	if err != nil || format != "jpeg" {
		t.Fatalf("original decode config format=%q, err=%v; want JPEG", format, err)
	}
	if originalConfig.Width != 800 || originalConfig.Height != 600 {
		t.Errorf("original dimensions = %dx%d, want 800x600", originalConfig.Width, originalConfig.Height)
	}
	thumbConfig, format, err := image.DecodeConfig(bytes.NewReader(mustReadFile(t, firstThumb)))
	if err != nil || format != "jpeg" {
		t.Fatalf("thumbnail decode config format=%q, err=%v; want JPEG", format, err)
	}
	if thumbConfig.Width != 400 || thumbConfig.Height != 300 {
		t.Errorf("thumbnail dimensions = %dx%d, want 400x300", thumbConfig.Width, thumbConfig.Height)
	}

	served := serveRecipeImageForTest(t, recipeID, "original")
	if served.Code != http.StatusOK || served.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("GET original status=%d content-type=%q body=%s", served.Code, served.Header().Get("Content-Type"), served.Body.String())
	}
	if served.Header().Get("ETag") == "" || served.Header().Get("Cache-Control") != "private, max-age=0, must-revalidate" {
		t.Errorf("image cache headers = %v", served.Header())
	}
	if _, format, err := image.Decode(bytes.NewReader(served.Body.Bytes())); err != nil || format != "jpeg" {
		t.Errorf("served original is not a JPEG: format=%q err=%v", format, err)
	}

	second := uploadRecipeImageForTest(t, recipeID, "new-curry.png", pngBytesForTest(t, 320, 640, color.RGBA{R: 20, G: 80, B: 220, A: 255}))
	if second.Code != http.StatusOK {
		t.Fatalf("replacement upload status = %d, body = %s", second.Code, second.Body.String())
	}
	var secondResponse recipeImageUploadResponse
	if err := json.NewDecoder(second.Body).Decode(&secondResponse); err != nil {
		t.Fatalf("decoding replacement response: %v", err)
	}
	if secondResponse.Filename == firstResponse.Filename {
		t.Fatal("replacement should have a new image version for cache invalidation")
	}
	if firstResponse.UpdatedAt.Equal(secondResponse.UpdatedAt) {
		t.Error("replacement should update the recipe timestamp")
	}
	if _, err := os.Stat(firstOriginal); !os.IsNotExist(err) {
		t.Errorf("replaced original should be removed; stat error = %v", err)
	}
	if _, err := os.Stat(firstThumb); !os.IsNotExist(err) {
		t.Errorf("replaced thumbnail should be removed; stat error = %v", err)
	}
	newServed := serveRecipeImageForTest(t, recipeID, "original")
	if newServed.Code != http.StatusOK || newServed.Header().Get("ETag") == served.Header().Get("ETag") {
		t.Errorf("replacement response status=%d, ETag=%q; prior ETag=%q", newServed.Code, newServed.Header().Get("ETag"), served.Header().Get("ETag"))
	}
	var storedAgain string
	if err := database.DB.QueryRow(`SELECT image_filename FROM recipes WHERE id = ?`, recipeID).Scan(&storedAgain); err != nil {
		t.Fatalf("reading replacement filename: %v", err)
	}
	if storedAgain != secondResponse.Filename {
		t.Errorf("stored replacement filename = %q, want %q", storedAgain, secondResponse.Filename)
	}
}

func TestUploadRecipeImageRejectsMissingInvalidAndOversizedFiles(t *testing.T) {
	setupHandlerDB(t)
	useTemporaryRecipeImageDir(t)
	creatorID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", creatorID)

	tests := []struct {
		name       string
		filename   string
		content    []byte
		wantStatus int
	}{
		{name: "missing image", wantStatus: http.StatusBadRequest},
		{name: "invalid bytes", filename: "not-an-image.png", content: []byte("not an image"), wantStatus: http.StatusBadRequest},
		{name: "oversized image", filename: "too-large.png", content: bytes.Repeat([]byte{'x'}, maxImageSize+1), wantStatus: http.StatusRequestEntityTooLarge},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := uploadRecipeImageForTest(t, recipeID, test.filename, test.content)
			if recorder.Code != test.wantStatus {
				t.Errorf("status = %d, want %d; body = %s", recorder.Code, test.wantStatus, recorder.Body.String())
			}
		})
	}

	var stored sql.NullString
	if err := database.DB.QueryRow(`SELECT image_filename FROM recipes WHERE id = ?`, recipeID).Scan(&stored); err != nil {
		t.Fatalf("reading image filename: %v", err)
	}
	if stored.Valid && stored.String != "" {
		t.Errorf("invalid uploads should not set image_filename, got %q", stored.String)
	}
}

func TestRecipeImageServingSupportsLegacyFilesAndRejectsUnsafeNames(t *testing.T) {
	setupHandlerDB(t)
	imageDirectory := useTemporaryRecipeImageDir(t)
	creatorID := createTestUser(t, "wife@example.com", "2026-09-28", 1500)
	recipeID := createTestRecipe(t, "Chicken Curry", creatorID)

	legacyPath := filepath.Join(imageDirectory, fmt.Sprintf("%d_original.jpg", recipeID))
	legacyFile, err := os.Create(legacyPath)
	if err != nil {
		t.Fatalf("creating legacy image: %v", err)
	}
	if err := jpeg.Encode(legacyFile, image.NewRGBA(image.Rect(0, 0, 2, 2)), &jpeg.Options{Quality: 80}); err != nil {
		legacyFile.Close()
		t.Fatalf("encoding legacy image: %v", err)
	}
	if err := legacyFile.Close(); err != nil {
		t.Fatalf("closing legacy image: %v", err)
	}
	if _, err := database.DB.Exec(`UPDATE recipes SET image_filename = ? WHERE id = ?`, strconv.FormatInt(recipeID, 10), recipeID); err != nil {
		t.Fatalf("marking legacy image present: %v", err)
	}
	if got := serveRecipeImageForTest(t, recipeID, "original"); got.Code != http.StatusOK {
		t.Errorf("legacy image status = %d, body = %s", got.Code, got.Body.String())
	}

	if _, err := database.DB.Exec(`UPDATE recipes SET image_filename = ? WHERE id = ?`, "../../outside", recipeID); err != nil {
		t.Fatalf("setting malicious image filename: %v", err)
	}
	if got := serveRecipeImageForTest(t, recipeID, "original"); got.Code != http.StatusNotFound {
		t.Errorf("unsafe image version status = %d, want 404", got.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/images/recipes/../original", nil)
	req.SetPathValue("id", "../")
	req.SetPathValue("type", "original")
	recorder := httptest.NewRecorder()
	HandleGetRecipeImage(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("invalid ID status = %d, want 400", recorder.Code)
	}
}

func TestResizeImageCapsLongestDimension(t *testing.T) {
	portrait := image.NewRGBA(image.Rect(0, 0, 300, 900))
	resized := resizeImage(portrait, 400)
	if got := resized.Bounds().Dx(); got != 133 {
		t.Errorf("portrait width = %d, want 133", got)
	}
	if got := resized.Bounds().Dy(); got != 400 {
		t.Errorf("portrait height = %d, want 400", got)
	}
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %q: %v", path, err)
	}
	return content
}
