package main

import (
	"net/http"
	"path/filepath"
	"strings"
)

// nextFrontendHandler serves the React build at the temporary /next/ path.
// The legacy UI remains the default; Vite's hashed assets can be cached
// immutably, while the app shell must be revalidated on every navigation.
func nextFrontendHandler(distDir string) http.Handler {
	files := http.FileServer(http.Dir(distDir))
	assets := http.StripPrefix("/next/", files)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		relativePath := strings.TrimPrefix(r.URL.Path, "/next/")
		if strings.HasPrefix(relativePath, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			assets.ServeHTTP(w, r)
			return
		}

		w.Header().Set("Cache-Control", "no-store, must-revalidate")
		http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
	})
}
