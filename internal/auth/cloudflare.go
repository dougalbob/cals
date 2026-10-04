package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type CloudflareAuth struct {
	TeamDomain string
	PolicyAUD  string
	keys       map[string]*rsa.PublicKey
	keysMutex  sync.RWMutex
	lastFetch  time.Time
}

type JWKS struct {
	Keys []JWK `json:"keys"`
}

type JWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type Claims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

func NewCloudflareAuth(teamDomain, policyAUD string) *CloudflareAuth {
	return &CloudflareAuth{
		TeamDomain: teamDomain,
		PolicyAUD:  policyAUD,
		keys:       make(map[string]*rsa.PublicKey),
	}
}

func (ca *CloudflareAuth) fetchKeys() error {
	ca.keysMutex.Lock()
	defer ca.keysMutex.Unlock()

	// Only fetch if keys are older than 1 hour
	if time.Since(ca.lastFetch) < time.Hour && len(ca.keys) > 0 {
		return nil
	}

	url := fmt.Sprintf("https://%s/cdn-cgi/access/certs", ca.TeamDomain)
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var jwks JWKS
	if err := json.Unmarshal(body, &jwks); err != nil {
		return err
	}

	for _, key := range jwks.Keys {
		if key.Kty != "RSA" {
			continue
		}

		nBytes, err := base64.RawURLEncoding.DecodeString(key.N)
		if err != nil {
			continue
		}

		eBytes, err := base64.RawURLEncoding.DecodeString(key.E)
		if err != nil {
			continue
		}

		n := new(big.Int).SetBytes(nBytes)
		e := int(new(big.Int).SetBytes(eBytes).Int64())

		ca.keys[key.Kid] = &rsa.PublicKey{N: n, E: e}
	}

	ca.lastFetch = time.Now()
	return nil
}

func (ca *CloudflareAuth) ValidateToken(tokenString string) (*Claims, error) {
	if err := ca.fetchKeys(); err != nil {
		return nil, fmt.Errorf("failed to fetch keys: %w", err)
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, errors.New("missing kid in token header")
		}

		ca.keysMutex.RLock()
		key, exists := ca.keys[kid]
		ca.keysMutex.RUnlock()

		if !exists {
			return nil, fmt.Errorf("unknown key id: %s", kid)
		}

		return key, nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	// Verify audience
	aud, err := claims.GetAudience()
	if err != nil {
		return nil, err
	}
	
	validAud := false
	for _, a := range aud {
		if a == ca.PolicyAUD {
			validAud = true
			break
		}
	}
	if !validAud {
		return nil, errors.New("invalid audience")
	}

	return claims, nil
}

func (ca *CloudflareAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenString := r.Header.Get("Cf-Access-Jwt-Assertion")
		if tokenString == "" {
			// Check cookie as fallback
			cookie, err := r.Cookie("CF_Authorization")
			if err != nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			tokenString = cookie.Value
		}

		claims, err := ca.ValidateToken(tokenString)
		if err != nil {
			http.Error(w, "Unauthorized: "+err.Error(), http.StatusUnauthorized)
			return
		}

		// The verified identity is both the authenticated and the acting user
		// until the Admin acting-user switch overrides the latter.
		email := strings.ToLower(claims.Email)
		ctx := context.WithValue(r.Context(), UserEmailKey, email)
		ctx = WithAuthenticatedEmail(ctx, email)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
