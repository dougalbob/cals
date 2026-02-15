package handlers

import (
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"golang.org/x/image/draw"

	"cals/internal/database"
)

const (
	imageDir      = "/app/data/images/recipes"
	maxImageSize  = 10 << 20 // 10MB
	thumbWidth    = 400
)

// HandleUploadRecipeImage handles image upload for a recipe
func HandleUploadRecipeImage(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	// Verify recipe exists
	var exists bool
	err = database.DB.QueryRow(`SELECT 1 FROM recipes WHERE id = ?`, id).Scan(&exists)
	if err != nil {
		http.Error(w, "Recipe not found", http.StatusNotFound)
		return
	}

	// Parse multipart form
	r.Body = http.MaxBytesReader(w, r.Body, maxImageSize)
	if err := r.ParseMultipartForm(maxImageSize); err != nil {
		http.Error(w, "Image too large (max 10MB)", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "No image provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Decode image
	img, format, err := image.Decode(file)
	if err != nil {
		http.Error(w, "Invalid image format", http.StatusBadRequest)
		return
	}
	_ = format

	// Ensure directory exists
	if err := os.MkdirAll(imageDir, 0755); err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// Save original
	originalPath := filepath.Join(imageDir, fmt.Sprintf("%d_original.jpg", id))
	originalFile, err := os.Create(originalPath)
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer originalFile.Close()

	if err := jpeg.Encode(originalFile, img, &jpeg.Options{Quality: 90}); err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// Create and save thumbnail
	thumb := resizeImage(img, thumbWidth)
	thumbPath := filepath.Join(imageDir, fmt.Sprintf("%d_thumb.jpg", id))
	thumbFile, err := os.Create(thumbPath)
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer thumbFile.Close()

	if err := jpeg.Encode(thumbFile, thumb, &jpeg.Options{Quality: 85}); err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// Update recipe with image filename
	filename := fmt.Sprintf("%d", id)
	_, err = database.DB.Exec(`UPDATE recipes SET image_filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, filename, id)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"filename": "%s"}`, filename)))
}

func resizeImage(img image.Image, maxWidth int) image.Image {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	if width <= maxWidth {
		return img
	}

	ratio := float64(maxWidth) / float64(width)
	newWidth := maxWidth
	newHeight := int(float64(height) * ratio)

	dst := image.NewRGBA(image.Rect(0, 0, newWidth, newHeight))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)

	return dst
}

// HandleGetRecipeImage serves a recipe image
func HandleGetRecipeImage(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	imageType := r.PathValue("type") // "thumb" or "original"

	if imageType != "thumb" && imageType != "original" {
		imageType = "thumb"
	}

	filename := fmt.Sprintf("%s_%s.jpg", idStr, imageType)
	path := filepath.Join(imageDir, filename)

	file, err := os.Open(path)
	if err != nil {
		http.Error(w, "Image not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	io.Copy(w, file)
}
