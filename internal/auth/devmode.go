package auth

import (
	"context"
	"net/http"
	"net/netip"
	"strings"
)

// DevModeMiddleware supplies a fixed local identity, but only to requests whose
// direct network peer is loopback or a private IP. It deliberately does not
// trust proxy headers such as X-Forwarded-For.
func DevModeMiddleware(userEmail string) func(http.Handler) http.Handler {
	userEmail = strings.ToLower(strings.TrimSpace(userEmail))

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

func isLoopbackOrPrivateRemoteAddr(remoteAddr string) bool {
	addrPort, err := netip.ParseAddrPort(remoteAddr)
	if err != nil {
		return false
	}

	ip := addrPort.Addr().Unmap()
	return ip.IsLoopback() || ip.IsPrivate()
}
