package auth

import (
	"context"
	"log"
	"net/http"
	"net/netip"
	"strings"
)

const (
	// DevIdentityCookieName remembers the identity chosen by a developer. It is
	// only read when the DEV identity switch is enabled (DEV_MODE=true and
	// DEV_IDENTITY_SWITCH=true), and only for loopback/private peers.
	DevIdentityCookieName = "cals_dev_identity"
	// DevIdentityQueryParam overrides the identity for one request and stores
	// the choice in DevIdentityCookieName before redirecting to the same URL.
	DevIdentityQueryParam = "as"
)

// DevUserLookup reports whether an email belongs to an existing user. The DEV
// identity switch never creates users, so unknown emails are rejected.
type DevUserLookup func(email string) (bool, error)

// DevModeMiddleware supplies a fixed local identity, but only to requests whose
// direct network peer is loopback or a private IP. It deliberately does not
// trust proxy headers such as X-Forwarded-For.
func DevModeMiddleware(userEmail string) func(http.Handler) http.Handler {
	userEmail = normalizeEmail(userEmail)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isLoopbackOrPrivateRemoteAddr(r.RemoteAddr) {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserEmailKey, userEmail)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// DevIdentityMiddleware is DevModeMiddleware plus the opt-in identity switch:
// a developer can pick any existing user from the minimal /dev/identity page
// (or append ?as=<email> to any URL) without editing environment variables and
// restarting. The chosen identity is remembered in a cookie for that browser.
//
// Safety properties are deliberately identical to DevModeMiddleware: only
// loopback/private socket peers are served, proxy headers are never trusted,
// and only users that already exist in the database can be selected. The
// switch is registered by main.go only when DEV_MODE and DEV_IDENTITY_SWITCH
// are both true, which production (and therefore the Cloudflare-routed
// container) never sets.
func DevIdentityMiddleware(defaultEmail string, lookup DevUserLookup) func(http.Handler) http.Handler {
	defaultEmail = normalizeEmail(defaultEmail)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isLoopbackOrPrivateRemoteAddr(r.RemoteAddr) {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			identity := defaultEmail

			if r.URL.Query().Has(DevIdentityQueryParam) {
				requested := normalizeEmail(r.URL.Query().Get(DevIdentityQueryParam))
				if requested == "" {
					// ?as= (empty) clears the remembered choice.
					clearDevIdentityCookie(w)
					http.Redirect(w, r, withoutDevIdentityParam(r), http.StatusSeeOther)
					return
				}

				exists, err := lookup(requested)
				if err != nil {
					http.Error(w, "Database error resolving dev identity", http.StatusInternalServerError)
					return
				}
				if !exists {
					http.Error(w, "Unknown dev identity: no existing user has that email", http.StatusBadRequest)
					return
				}

				setDevIdentityCookie(w, requested)
				http.Redirect(w, r, withoutDevIdentityParam(r), http.StatusSeeOther)
				return
			}

			if cookie, err := r.Cookie(DevIdentityCookieName); err == nil {
				candidate := normalizeEmail(cookie.Value)
				exists, lookupErr := lookup(candidate)
				switch {
				case lookupErr != nil:
					http.Error(w, "Database error resolving dev identity", http.StatusInternalServerError)
					return
				case exists:
					identity = candidate
				default:
					// The remembered user no longer exists: forget it and fall
					// back to the configured default rather than failing.
					log.Printf("DEV identity switch: remembered user %q no longer exists; falling back to %s", candidate, defaultEmail)
					clearDevIdentityCookie(w)
				}
			}

			ctx := context.WithValue(r.Context(), UserEmailKey, identity)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func setDevIdentityCookie(w http.ResponseWriter, email string) {
	http.SetCookie(w, &http.Cookie{
		Name:     DevIdentityCookieName,
		Value:    email,
		Path:     "/",
		MaxAge:   60 * 60 * 12,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearDevIdentityCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     DevIdentityCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

// withoutDevIdentityParam returns the request path and query with the ?as=
// override removed, so the redirect target is a clean URL that can be shared
// or reloaded without re-applying (or re-validating) the override.
func withoutDevIdentityParam(r *http.Request) string {
	query := r.URL.Query()
	query.Del(DevIdentityQueryParam)
	if len(query) == 0 {
		return r.URL.Path
	}
	return r.URL.Path + "?" + query.Encode()
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func isLoopbackOrPrivateRemoteAddr(remoteAddr string) bool {
	addrPort, err := netip.ParseAddrPort(remoteAddr)
	if err != nil {
		return false
	}

	ip := addrPort.Addr().Unmap()
	return ip.IsLoopback() || ip.IsPrivate()
}
