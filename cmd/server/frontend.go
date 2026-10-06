package main

import (
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
)

// spaHandler serves the built React app from distDir at mountPath.
//
// mountPath is the URL prefix the app owns, always written with a trailing
// slash ("/" at the root). It must match Vite's `base` in
// web/frontend/vite.config.ts: that one value also produces the bundle's asset
// URLs and the manifest's id/start_url/scope, so a mismatch fails silently as a
// broken PWA rather than as an error.
//
// Serving rules, unchanged from the old /next/ handler:
//   - the PWA's real files (manifest, worker, icons, Workbox runtime) are never
//     shadowed by the app shell;
//   - Vite's content-hashed assets under assets/ are cached immutably;
//   - any other URL that looks like a file is a missing asset, so it 404s
//     instead of returning the shell with a 200;
//   - extension-less paths are client-side routes and get the shell with
//     no-store, so a redeploy is never served from a stale cached shell.
func spaHandler(mountPath string, distDir string) http.Handler {
	files := http.FileServer(http.Dir(distDir))
	assets := http.StripPrefix(mountPath, files)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		relativePath := strings.TrimPrefix(r.URL.Path, mountPath)

		// The React PWA's generated manifest, worker, icons and any Workbox
		// runtime are real files at the mount point. They must never fall
		// through to the SPA shell, and they are separate from the legacy
		// lifeboat's own manifest and worker under /public/.
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
				// Without this the browser clamps the worker's scope to the
				// directory holding sw.js. At the root that is already "/", but
				// stating it keeps the mount point explicit.
				w.Header().Set("Service-Worker-Allowed", mountPath)
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

// legacyShellHandler serves the retired vanilla-JS UI from shellPath.
//
// It exists only as a lifeboat while the owner decides whether to delete the
// legacy code (phase-16-plan.md §5, stage 16.4). The legacy shell is a single
// page with no client-side routing and every asset reference absolute
// (/static/..., /public/...), so the same file works from any path and needs no
// change to be served from /legacy/ — see phase-16-plan.md §2.3.
func legacyShellHandler(shellPath string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Nothing under /legacy/ is a file: the shell's assets live at /static/
		// and /public/. A file-like URL here is a mistake, not a route.
		if filepath.Ext(r.URL.Path) != "" {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Cache-Control", "no-store, must-revalidate")
		http.ServeFile(w, r, shellPath)
	})
}

// registerFrontendRoutes wires up which UI owns which path:
//
//	/                the React app — the default UI since the Phase 16 cutover
//	/legacy/         the unchanged legacy vanilla-JS UI, an unlinked lifeboat
//	/next, /next/*   308 onto the same path with the /next prefix stripped
//
// This is a function rather than inline registrations in main() because this
// route table is the one part of the phase that can take the household's front
// door offline: a wrong pattern is an outage, not a cosmetic bug. Keeping it
// here puts the real ServeMux under test (frontend_test.go) instead of leaving
// it reachable only through main().
//
// The API routes registered in main() are all more specific than "/", so they
// always win over the app shell.
func registerFrontendRoutes(mux *http.ServeMux, distDir string, legacyShell string) {
	// Root: the React app.
	//
	// Registered for GET only. The previous catch-all answered every method with
	// the legacy HTML shell, including POSTs to paths that have no handler; Go's
	// ServeMux now answers those 405 instead, which is the correct response. No
	// client posts to a non-API path: the legacy UI's only non-GET call is
	// POST /api/recipes/{id}/image.
	//
	// Unknown /api/* paths must stay 404s rather than falling through to the app
	// shell with a 200, which is what the previous catch-all did.
	root := spaHandler("/", distDir)
	mux.Handle("GET /", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		root.ServeHTTP(w, r)
	}))

	// The retired /next/ mount (Phases 11–15). Everything under it redirects by
	// stripping the prefix, so bookmarks, deep links, the Unraid template's WebUI
	// link and any home-screen start URL recorded at /next/ all keep working.
	// 308 is deliberate: /next/ is genuinely gone, not temporarily moved.
	redirectRetiredNext := func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, retiredPrefixTarget(r.URL, "/next"), http.StatusPermanentRedirect)
	}
	mux.HandleFunc("GET /next", redirectRetiredNext)
	mux.HandleFunc("GET /next/", redirectRetiredNext)

	// The legacy vanilla-JS UI, served unlinked as a lifeboat until the owner
	// approves deleting it (phase-16-plan.md §5, stage 16.4). Its assets are
	// absolute, so the unchanged shell works from here.
	mux.HandleFunc("GET /legacy", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/legacy/", http.StatusPermanentRedirect)
	})
	mux.Handle("GET /legacy/", legacyShellHandler(legacyShell))
}

// retiredPrefixTarget maps a URL under a retired mount point onto its
// replacement by stripping the prefix, preserving the rest of the path and the
// query string:
//
//	/next/diary/2026-10-02?as=x  →  /diary/2026-10-02?as=x
//	/next/                       →  /
//
// prefix must be written without a trailing slash ("/next"). EscapedPath is
// used rather than Path so percent-encoded segments survive the redirect.
func retiredPrefixTarget(u *url.URL, prefix string) string {
	target := strings.TrimPrefix(u.EscapedPath(), prefix)
	if target == "" {
		target = "/"
	} else if !strings.HasPrefix(target, "/") {
		target = "/" + target
	}
	if u.RawQuery != "" {
		target += "?" + u.RawQuery
	}
	return target
}
