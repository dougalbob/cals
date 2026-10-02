package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsLoopbackOrPrivateRemoteAddr(t *testing.T) {
	tests := []struct {
		remoteAddr string
		want       bool
	}{
		{remoteAddr: "127.0.0.1:54321", want: true},
		{remoteAddr: "[::1]:54321", want: true},
		{remoteAddr: "10.2.3.4:54321", want: true},
		{remoteAddr: "172.16.0.1:54321", want: true},
		{remoteAddr: "192.168.1.20:54321", want: true},
		{remoteAddr: "[fd00::1]:54321", want: true},
		{remoteAddr: "[::ffff:192.168.1.20]:54321", want: true},
		{remoteAddr: "8.8.8.8:54321", want: false},
		{remoteAddr: "203.0.113.8:54321", want: false},
		{remoteAddr: "169.254.1.2:54321", want: false},
		{remoteAddr: "100.64.0.1:54321", want: false},
		{remoteAddr: "172.32.0.1:54321", want: false},
		{remoteAddr: "192.0.2.1:54321", want: false},
		{remoteAddr: "not-an-address", want: false},
		{remoteAddr: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.remoteAddr, func(t *testing.T) {
			if got := isLoopbackOrPrivateRemoteAddr(tt.remoteAddr); got != tt.want {
				t.Errorf("isLoopbackOrPrivateRemoteAddr(%q) = %v, want %v", tt.remoteAddr, got, tt.want)
			}
		})
	}
}

func TestDevModeMiddlewareAddsLocalUserEmail(t *testing.T) {
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if got, want := GetUserEmail(r.Context()), "user@example.com"; got != want {
			t.Errorf("GetUserEmail() = %q, want %q", got, want)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.RemoteAddr = "192.168.1.10:54321"
	recorder := httptest.NewRecorder()

	DevModeMiddleware(" USER@EXAMPLE.COM ")(next).ServeHTTP(recorder, req)

	if !called {
		t.Fatal("next handler was not called for a private peer")
	}
	if recorder.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
}

func TestDevModeMiddlewareRejectsPublicPeerAndIgnoresForwardedHeaders(t *testing.T) {
	called := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called = true
	})

	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.RemoteAddr = "8.8.8.8:54321"
	req.Header.Set("X-Forwarded-For", "127.0.0.1")
	recorder := httptest.NewRecorder()

	DevModeMiddleware("user@example.com")(next).ServeHTTP(recorder, req)

	if called {
		t.Fatal("next handler was called for a public peer")
	}
	if recorder.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}
