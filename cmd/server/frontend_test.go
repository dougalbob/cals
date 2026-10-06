package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const reactShellBody = "react-shell"
const legacyShellBody = "legacy-shell"

// newFrontendTestTree writes a realistic web/dist tree plus a legacy shell into
// a temp directory, so the handlers are tested against the file layout the
// Docker image actually produces.
func newFrontendTestTree(t *testing.T) (distDir string, legacyShell string) {
	t.Helper()

	distDir = t.TempDir()
	assetsDir := filepath.Join(distDir, "assets")
	pwaDir := filepath.Join(distDir, "pwa")
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(pwaDir, 0o755); err != nil {
		t.Fatal(err)
	}

	files := map[string]string{
		filepath.Join(distDir, "index.html"):             reactShellBody,
		filepath.Join(distDir, "manifest.webmanifest"):   `{"id":"/","start_url":"/","scope":"/"}`,
		filepath.Join(distDir, "sw.js"):                  "network-only-worker",
		filepath.Join(distDir, "workbox-abcd.js"):        "workbox-runtime",
		filepath.Join(assetsDir, "app-abc123.js"):        "hashed-bundle",
		filepath.Join(assetsDir, "app-abc123.css"):       "hashed-css",
		filepath.Join(pwaDir, "icon-192.png"):            "react-pwa-icon",
	}
	for path, body := range files {
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	legacyShell = filepath.Join(t.TempDir(), "index.html")
	if err := os.WriteFile(legacyShell, []byte(legacyShellBody), 0o644); err != nil {
		t.Fatal(err)
	}
	return distDir, legacyShell
}

// TestSpaHandlerAtRoot covers the handler at its post-cutover mount point.
func TestSpaHandlerAtRoot(t *testing.T) {
	distDir, _ := newFrontendTestTree(t)
	handler := spaHandler("/", distDir)

	t.Run("PWA files are served from the root instead of the SPA shell", func(t *testing.T) {
		for _, test := range []struct {
			path, body, contentType string
		}{
			{"manifest.webmanifest", `{"id":"/","start_url":"/","scope":"/"}`, "application/manifest+json; charset=utf-8"},
			{"sw.js", "network-only-worker", "application/javascript; charset=utf-8"},
			{"workbox-abcd.js", "workbox-runtime", "application/javascript; charset=utf-8"},
			{"pwa/icon-192.png", "react-pwa-icon", "image/png"},
		} {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/"+test.path, nil))

			if recorder.Code != http.StatusOK {
				t.Fatalf("GET /%s status = %d, want 200 (body: %s)", test.path, recorder.Code, recorder.Body.String())
			}
			if recorder.Body.String() != test.body {
				t.Errorf("GET /%s body = %q, want %q", test.path, recorder.Body.String(), test.body)
			}
			if got := recorder.Header().Get("Content-Type"); got != test.contentType {
				t.Errorf("GET /%s Content-Type = %q, want %q", test.path, got, test.contentType)
			}
			if got := recorder.Header().Get("Cache-Control"); got != "no-cache, max-age=0, must-revalidate" {
				t.Errorf("GET /%s Cache-Control = %q, want revalidation", test.path, got)
			}
			if strings.Contains(recorder.Body.String(), reactShellBody) {
				t.Errorf("GET /%s unexpectedly returned the app shell", test.path)
			}
			// The worker's scope must be the root, or the browser clamps it to
			// the script's own directory and the PWA controls nothing.
			if test.path == "sw.js" && recorder.Header().Get("Service-Worker-Allowed") != "/" {
				t.Errorf("Service-Worker-Allowed = %q, want /", recorder.Header().Get("Service-Worker-Allowed"))
			}
		}
	})

	t.Run("missing PWA files do not fall back to the app shell", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/manifest.webmanifest.missing", nil))
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", recorder.Code)
		}
		if strings.Contains(recorder.Body.String(), reactShellBody) {
			t.Fatal("missing PWA file unexpectedly returned the app shell")
		}
	})

	t.Run("the root and deep links serve the shell without caching it", func(t *testing.T) {
		for _, path := range []string{"/", "/diary", "/diary/2026-10-02", "/metrics", "/settings"} {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))

			if recorder.Code != http.StatusOK {
				t.Fatalf("GET %s status = %d, want 200", path, recorder.Code)
			}
			if recorder.Body.String() != reactShellBody {
				t.Fatalf("GET %s body = %q, want React shell", path, recorder.Body.String())
			}
			if got := recorder.Header().Get("Cache-Control"); got != "no-store, must-revalidate" {
				t.Fatalf("GET %s Cache-Control = %q, want no-store", path, got)
			}
		}
	})

	t.Run("hashed assets are served with immutable caching", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/assets/app-abc123.js", nil))

		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body: %s)", recorder.Code, recorder.Body.String())
		}
		if recorder.Body.String() != "hashed-bundle" {
			t.Fatalf("body = %q, want hashed bundle", recorder.Body.String())
		}
		if got := recorder.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
			t.Fatalf("Cache-Control = %q, want immutable caching", got)
		}
	})

	t.Run("missing assets do not fall back to the app shell", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil))

		if recorder.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", recorder.Code)
		}
		if strings.Contains(recorder.Body.String(), reactShellBody) {
			t.Fatal("missing asset unexpectedly returned the app shell")
		}
	})

	t.Run("unsupported methods are rejected", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/", nil))

		if recorder.Code != http.StatusMethodNotAllowed {
			t.Fatalf("status = %d, want 405", recorder.Code)
		}
		if got := recorder.Header().Get("Allow"); got != "GET, HEAD" {
			t.Fatalf("Allow = %q, want GET, HEAD", got)
		}
	})
}

func TestLegacyShellHandler(t *testing.T) {
	_, legacyShell := newFrontendTestTree(t)
	handler := legacyShellHandler(legacyShell)

	t.Run("serves the unchanged legacy shell", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/legacy/", nil))

		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", recorder.Code)
		}
		if recorder.Body.String() != legacyShellBody {
			t.Fatalf("body = %q, want the legacy shell", recorder.Body.String())
		}
		if strings.Contains(recorder.Body.String(), reactShellBody) {
			t.Fatal("the lifeboat served the React shell")
		}
		if got := recorder.Header().Get("Cache-Control"); got != "no-store, must-revalidate" {
			t.Fatalf("Cache-Control = %q, want no-store", got)
		}
	})

	t.Run("a file-like URL under the lifeboat is a 404, not the shell", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/legacy/app.js", nil))
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", recorder.Code)
		}
	})

	t.Run("unsupported methods are rejected", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/legacy/", nil))
		if recorder.Code != http.StatusMethodNotAllowed {
			t.Fatalf("status = %d, want 405", recorder.Code)
		}
	})
}

func TestRetiredPrefixTarget(t *testing.T) {
	for _, test := range []struct {
		raw       string
		wantPath  string
		wantQuery string
	}{
		{raw: "/next", wantPath: "/"},
		{raw: "/next/", wantPath: "/"},
		{raw: "/next/diary", wantPath: "/diary"},
		{raw: "/next/diary/2026-10-02", wantPath: "/diary/2026-10-02"},
		{raw: "/next/settings?as=someone%40example.com", wantPath: "/settings", wantQuery: "as=someone%40example.com"},
		{raw: "/next/recipes/3?add-to=dinner&on=2026-10-01", wantPath: "/recipes/3", wantQuery: "add-to=dinner&on=2026-10-01"},
		// A percent-encoded segment must survive the redirect rather than being
		// decoded into a different path.
		{raw: "/next/recipes/caf%C3%A9", wantPath: "/recipes/caf%C3%A9"},
	} {
		parsed, err := url.Parse(test.raw)
		if err != nil {
			t.Fatalf("url.Parse(%q): %v", test.raw, err)
		}
		got := retiredPrefixTarget(parsed, "/next")

		gotURL, err := url.Parse(got)
		if err != nil {
			t.Fatalf("retiredPrefixTarget(%q) = %q, which is not a valid URL: %v", test.raw, got, err)
		}
		if gotURL.EscapedPath() != test.wantPath {
			t.Errorf("retiredPrefixTarget(%q) path = %q, want %q", test.raw, gotURL.EscapedPath(), test.wantPath)
		}
		if gotURL.RawQuery != test.wantQuery {
			t.Errorf("retiredPrefixTarget(%q) query = %q, want %q", test.raw, gotURL.RawQuery, test.wantQuery)
		}
	}
}

// TestRegisterFrontendRoutes exercises the real route table: which UI owns which
// path is the one thing in Phase 16 that can take the household's front door
// offline, so it is asserted against an actual ServeMux rather than described in
// a document.
func TestRegisterFrontendRoutes(t *testing.T) {
	distDir, legacyShell := newFrontendTestTree(t)

	mux := http.NewServeMux()
	// Stand in for the API routes main.go registers, to prove the shell cannot
	// swallow them.
	mux.HandleFunc("GET /api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"version":"2.0.0"}`))
	})
	registerFrontendRoutes(mux, distDir, legacyShell)

	serve := func(method, target string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest(method, target, nil))
		return recorder
	}

	t.Run("the root serves React", func(t *testing.T) {
		recorder := serve(http.MethodGet, "/")
		if recorder.Code != http.StatusOK {
			t.Fatalf("GET / status = %d, want 200", recorder.Code)
		}
		if recorder.Body.String() != reactShellBody {
			t.Fatalf("GET / body = %q, want the React shell", recorder.Body.String())
		}
	})

	t.Run("deep links serve React", func(t *testing.T) {
		for _, path := range []string{"/diary/2026-10-02", "/metrics", "/nutrition", "/settings", "/recipes/3"} {
			recorder := serve(http.MethodGet, path)
			if recorder.Code != http.StatusOK || recorder.Body.String() != reactShellBody {
				t.Errorf("GET %s = %d %q, want 200 and the React shell", path, recorder.Code, recorder.Body.String())
			}
		}
	})

	t.Run("the PWA files are served at the root", func(t *testing.T) {
		for path, want := range map[string]string{
			"/manifest.webmanifest": `{"id":"/","start_url":"/","scope":"/"}`,
			"/sw.js":                "network-only-worker",
			"/pwa/icon-192.png":     "react-pwa-icon",
			"/assets/app-abc123.js": "hashed-bundle",
		} {
			recorder := serve(http.MethodGet, path)
			if recorder.Code != http.StatusOK {
				t.Errorf("GET %s status = %d, want 200", path, recorder.Code)
				continue
			}
			if recorder.Body.String() != want {
				t.Errorf("GET %s body = %q, want %q", path, recorder.Body.String(), want)
			}
		}
		if got := serve(http.MethodGet, "/sw.js").Header().Get("Service-Worker-Allowed"); got != "/" {
			t.Errorf("Service-Worker-Allowed = %q, want /", got)
		}
	})

	t.Run("unknown /api paths stay 404 instead of returning the shell", func(t *testing.T) {
		recorder := serve(http.MethodGet, "/api/does-not-exist")
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", recorder.Code)
		}
		if strings.Contains(recorder.Body.String(), reactShellBody) {
			t.Fatal("an unknown API path returned the app shell")
		}
	})

	t.Run("registered API routes still win over the shell", func(t *testing.T) {
		recorder := serve(http.MethodGet, "/api/version")
		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", recorder.Code)
		}
		if !strings.Contains(recorder.Body.String(), `"version"`) {
			t.Fatalf("body = %q, want the version JSON", recorder.Body.String())
		}
	})

	t.Run("the retired /next mount redirects with the prefix stripped", func(t *testing.T) {
		for _, test := range []struct {
			from, wantPath, wantQuery string
		}{
			{from: "/next", wantPath: "/"},
			{from: "/next/", wantPath: "/"},
			{from: "/next/diary", wantPath: "/diary"},
			{from: "/next/diary/2026-10-02", wantPath: "/diary/2026-10-02"},
			{from: "/next/settings?as=someone%40example.com", wantPath: "/settings", wantQuery: "as=someone%40example.com"},
		} {
			recorder := serve(http.MethodGet, test.from)
			if recorder.Code != http.StatusPermanentRedirect {
				t.Errorf("GET %s status = %d, want 308", test.from, recorder.Code)
				continue
			}
			location, err := url.Parse(recorder.Header().Get("Location"))
			if err != nil {
				t.Errorf("GET %s Location = %q, not a valid URL: %v", test.from, recorder.Header().Get("Location"), err)
				continue
			}
			if location.EscapedPath() != test.wantPath {
				t.Errorf("GET %s Location path = %q, want %q", test.from, location.EscapedPath(), test.wantPath)
			}
			if location.RawQuery != test.wantQuery {
				t.Errorf("GET %s Location query = %q, want %q", test.from, location.RawQuery, test.wantQuery)
			}
			// The redirect must not itself serve a UI.
			if strings.Contains(recorder.Body.String(), reactShellBody) {
				t.Errorf("GET %s served the app shell instead of redirecting", test.from)
			}
		}
	})

	t.Run("the legacy lifeboat still serves the old UI", func(t *testing.T) {
		if recorder := serve(http.MethodGet, "/legacy"); recorder.Code != http.StatusPermanentRedirect {
			t.Errorf("GET /legacy status = %d, want 308", recorder.Code)
		} else if got := recorder.Header().Get("Location"); !strings.HasSuffix(got, "/legacy/") {
			t.Errorf("GET /legacy Location = %q, want /legacy/", got)
		}

		recorder := serve(http.MethodGet, "/legacy/")
		if recorder.Code != http.StatusOK {
			t.Fatalf("GET /legacy/ status = %d, want 200", recorder.Code)
		}
		if recorder.Body.String() != legacyShellBody {
			t.Fatalf("GET /legacy/ body = %q, want the legacy shell", recorder.Body.String())
		}
	})

	t.Run("non-GET methods on the UI paths are rejected, not served a shell", func(t *testing.T) {
		// The previous catch-all answered POSTs to almost any path with the
		// legacy HTML shell and a 200.
		for _, target := range []string{"/", "/diary", "/legacy/"} {
			recorder := serve(http.MethodPost, target)
			if recorder.Code != http.StatusMethodNotAllowed {
				t.Errorf("POST %s status = %d, want 405", target, recorder.Code)
			}
		}
	})
}
