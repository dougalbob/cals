package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNextFrontendHandler(t *testing.T) {
	distDir := t.TempDir()
	assetsDir := filepath.Join(distDir, "assets")
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("react-shell"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assetsDir, "app-abc123.js"), []byte("hashed-bundle"), 0o644); err != nil {
		t.Fatal(err)
	}

	handler := nextFrontendHandler(distDir)

	t.Run("deep links serve the shell without caching it", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/next/diary/2026-10-02", nil)
		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
		}
		if recorder.Body.String() != "react-shell" {
			t.Fatalf("body = %q, want React shell", recorder.Body.String())
		}
		if got := recorder.Header().Get("Cache-Control"); got != "no-store, must-revalidate" {
			t.Fatalf("Cache-Control = %q, want no-store", got)
		}
	})

	t.Run("hashed assets are served with immutable caching", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/next/assets/app-abc123.js", nil)
		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d (body: %s)", recorder.Code, http.StatusOK, recorder.Body.String())
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
		request := httptest.NewRequest(http.MethodGet, "/next/assets/missing.js", nil)
		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
		}
		if strings.Contains(recorder.Body.String(), "react-shell") {
			t.Fatal("missing asset unexpectedly returned the app shell")
		}
	})

	t.Run("unsupported methods are rejected", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/next/", nil)
		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusMethodNotAllowed {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusMethodNotAllowed)
		}
		if got := recorder.Header().Get("Allow"); got != "GET, HEAD" {
			t.Fatalf("Allow = %q, want GET, HEAD", got)
		}
	})
}
