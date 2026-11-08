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

func identityLookup(emails ...string) DevUserLookup {
	known := make(map[string]bool, len(emails))
	for _, email := range emails {
		known[email] = true
	}
	return func(email string) (bool, error) { return known[email], nil }
}

func TestDevIdentityMiddlewareDefaultsToConfiguredUser(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got, want := GetUserEmail(r.Context()), "default@example.com"; got != want {
			t.Errorf("GetUserEmail() = %q, want %q", got, want)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.RemoteAddr = "192.168.1.10:54321"
	recorder := httptest.NewRecorder()

	DevIdentityMiddleware(" DEFAULT@Example.com ", identityLookup("default@example.com"))(next).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
}

func TestDevIdentityMiddlewareSwitchesToExistingUserViaQueryAndSetsCookie(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("the override request must redirect before reaching the next handler")
	})

	req := httptest.NewRequest(http.MethodGet, "/api/users/me?as=Wife@Example.com", nil)
	req.RemoteAddr = "192.168.1.10:54321"
	recorder := httptest.NewRecorder()

	DevIdentityMiddleware("default@example.com", identityLookup("default@example.com", "wife@example.com"))(next).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusSeeOther {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusSeeOther)
	}
	if got, want := recorder.Header().Get("Location"), "/api/users/me"; got != want {
		t.Errorf("Location = %q, want %q", got, want)
	}

	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies = %v, want exactly one", cookies)
	}
	if cookies[0].Name != DevIdentityCookieName || cookies[0].Value != "wife@example.com" {
		t.Errorf("cookie = %s=%q, want %s=wife@example.com", cookies[0].Name, cookies[0].Value, DevIdentityCookieName)
	}
}

func TestDevIdentityMiddlewareUsesRememberedCookie(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got, want := GetUserEmail(r.Context()), "wife@example.com"; got != want {
			t.Errorf("GetUserEmail() = %q, want %q", got, want)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.RemoteAddr = "192.168.1.10:54321"
	req.AddCookie(&http.Cookie{Name: DevIdentityCookieName, Value: "wife@example.com"})
	recorder := httptest.NewRecorder()

	DevIdentityMiddleware("default@example.com", identityLookup("default@example.com", "wife@example.com"))(next).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
}

func TestDevIdentityMiddlewareNeverCreatesOrAcceptsUnknownUsers(t *testing.T) {
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("next handler must not be called for an unknown identity")
	})
	lookup := identityLookup("default@example.com")

	req := httptest.NewRequest(http.MethodGet, "/api/users/me?as=ghost@example.com", nil)
	req.RemoteAddr = "192.168.1.10:54321"
	recorder := httptest.NewRecorder()
	DevIdentityMiddleware("default@example.com", lookup)(next).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("unknown user status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == DevIdentityCookieName && cookie.Value != "" {
			t.Errorf("unknown identity set a cookie: %s=%q", cookie.Name, cookie.Value)
		}
	}
}

func TestDevIdentityMiddlewareFallsBackWhenRememberedUserIsGone(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got, want := GetUserEmail(r.Context()), "default@example.com"; got != want {
			t.Errorf("GetUserEmail() = %q, want %q", got, want)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.RemoteAddr = "192.168.1.10:54321"
	req.AddCookie(&http.Cookie{Name: DevIdentityCookieName, Value: "deleted@example.com"})
	recorder := httptest.NewRecorder()

	DevIdentityMiddleware("default@example.com", identityLookup("default@example.com"))(next).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	cleared := false
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == DevIdentityCookieName && cookie.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Error("a stale remembered identity should be cleared")
	}
}

func TestDevIdentityMiddlewareClearsIdentityOnEmptyOverride(t *testing.T) {
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("the clear request must redirect before reaching the next handler")
	})

	req := httptest.NewRequest(http.MethodGet, "/dev/identity?as=", nil)
	req.RemoteAddr = "192.168.1.10:54321"
	req.AddCookie(&http.Cookie{Name: DevIdentityCookieName, Value: "wife@example.com"})
	recorder := httptest.NewRecorder()

	DevIdentityMiddleware("default@example.com", identityLookup("default@example.com", "wife@example.com"))(next).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusSeeOther {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusSeeOther)
	}
	if got, want := recorder.Header().Get("Location"), "/dev/identity"; got != want {
		t.Errorf("Location = %q, want %q", got, want)
	}
}

func TestDevIdentityMiddlewareRejectsPublicPeer(t *testing.T) {
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("next handler was called for a public peer")
	})

	req := httptest.NewRequest(http.MethodGet, "/dev/identity?as=wife@example.com", nil)
	req.RemoteAddr = "8.8.8.8:54321"
	req.Header.Set("X-Forwarded-For", "192.168.1.10")
	recorder := httptest.NewRecorder()

	DevIdentityMiddleware("default@example.com", identityLookup("default@example.com", "wife@example.com"))(next).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}
