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
		// The React PWA's generated manifest, network-only service worker,
		// icons and any Workbox runtime are real files under /next/. They must
		// never fall through to the SPA shell, and are separate from the legacy
		// root app's manifest and worker.
		if relativePath == "manifest.webmanifest" || relativePath == "sw.js" ||
			strings.HasPrefix(relativePath, "pwa/") || strings.HasPrefix(relativePath, "workbox-") {
			w.Header().Set("Cache-Control", "no-cache, max-age=0, must-revalidate")
			switch {
			case relativePath == "manifest.webmanifest":
				w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
			case relativePath == "sw.js" || strings.HasPrefix(relativePath, "workbox-"):
				w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
			}
			if relativePath == "sw.js" {
				w.Header().Set("Service-Worker-Allowed", "/next/")
			}
			assets.ServeHTTP(w, r)
			return
		}

		if strings.HasPrefix(relativePath, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			assets.ServeHTTP(w, r)
			return
		}

		// Unknown file-like URLs are missing assets, not client-side routes.
		if filepath.Ext(relativePath) != "" {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Cache-Control", "no-store, must-revalidate")
		http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
	})
}
