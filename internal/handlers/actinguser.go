package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"cals/internal/auth"
	"cals/internal/database"
	"cals/internal/models"
)

// The Admin acting-user switch (product decisions 45 and 88).
//
// An authenticated Admin may deliberately act as another existing household
// account: every read and write is then performed as that person, exactly as if
// they were using the app themselves (decision 45 — full read/write, no second
// data model). It is an application authorization, never a second login system:
// Cloudflare Access still decides who may reach cals at all.
//
// The switch is a plain server-side cookie. That is safe **because it is only
// ever honoured for an Admin**: the authenticated identity comes from the
// Cloudflare JWT and cannot be forged, so a cookie planted or hand-edited by a
// Standard user is ignored on sight. Signing the cookie would therefore protect
// against nothing the JWT does not already protect.
//
// Two identities travel in the request context and must not be confused:
//
//	auth.AuthenticatedEmailKey — who Cloudflare says you are (authorization)
//	auth.UserEmailKey          — whose data this request touches (acting user)

// ActingUserCookieName holds the id of the account an Admin is acting as.
const ActingUserCookieName = "cals_acting_user"

// actingUserCookieMaxAge bounds the switch to a normal browsing session, so an
// abandoned "viewing as" state cannot outlive the day. Expiry falls back to the
// Admin's own account — never to an error.
const actingUserCookieMaxAge = 60 * 60 * 12

// ActingUserMiddleware applies the acting-user switch recorded in the cookie.
// It runs after authentication and before every protected handler, and only
// ever rewrites the acting identity.
//
// Cost: nothing at all without the cookie (the common case), and two indexed
// lookups when one is present.
func ActingUserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authenticatedEmail := auth.GetAuthenticatedEmail(r.Context())
		if authenticatedEmail == "" {
			next.ServeHTTP(w, r)
			return
		}

		cookie, err := r.Cookie(ActingUserCookieName)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		actingEmail, ok := resolveActingUser(authenticatedEmail, cookie.Value)
		if !ok {
			// Stale, malformed or unauthorized: forget the cookie rather than
			// leaving the browser in a state the server will keep rejecting.
			clearActingUserCookie(w)
			next.ServeHTTP(w, r)
			return
		}
		if actingEmail == "" || actingEmail == authenticatedEmail {
			next.ServeHTTP(w, r)
			return
		}

		ctx := context.WithValue(r.Context(), auth.UserEmailKey, actingEmail)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// resolveActingUser returns the email the Admin should act as, and whether the
// cookie should be honoured at all.
func resolveActingUser(authenticatedEmail, cookieValue string) (string, bool) {
	targetID, err := strconv.ParseInt(cookieValue, 10, 64)
	if err != nil || targetID <= 0 {
		return "", false
	}

	// The switch is an Admin capability. A Standard user's cookie — however it
	// got there — is ignored, so forging one gains nothing.
	isAdmin, err := emailHoldsAdminRole(authenticatedEmail)
	if err != nil {
		log.Printf("acting-user switch: could not resolve the role of %s: %v", authenticatedEmail, err)
		return "", false
	}
	if !isAdmin {
		return "", false
	}

	target, err := userEmailByID(targetID)
	if err != nil {
		log.Printf("acting-user switch: could not resolve user id %d: %v", targetID, err)
		return "", false
	}
	if target == "" {
		// The account has gone (or the id never existed).
		return "", false
	}

	return target, true
}

// SessionResponse is the client's view of who is signed in and whose data is on
// screen. The UI reads it to show the persistent "viewing as" state and the way
// back, so it must always be able to name both people.
type SessionResponse struct {
	// AuthenticatedUser is who Cloudflare verified — the account the Admin
	// returns to.
	AuthenticatedUser models.User `json:"authenticated_user"`
	// ActingUser is whose data the app is showing right now.
	ActingUser models.User `json:"acting_user"`
	// IsAdmin reports the authenticated identity's role. It is what makes the
	// Swap user control appear, and it stays true while acting as someone else
	// so the Admin is never locked out of the way back.
	IsAdmin bool `json:"is_admin"`
	// ViewingAsOther is true when the acting user is not the authenticated one.
	ViewingAsOther bool `json:"viewing_as_other"`
}

// HandleGetSession reports the current acting and authenticated identities.
func HandleGetSession(w http.ResponseWriter, r *http.Request) {
	authenticatedEmail := auth.GetAuthenticatedEmail(r.Context())
	if authenticatedEmail == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	session, err := buildSessionResponse(r.Context())
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

// HandleSetActingUser switches the acting user to another existing account.
// Admin-only, checked against the authenticated identity.
func HandleSetActingUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	authenticatedEmail := auth.GetAuthenticatedEmail(ctx)
	if authenticatedEmail == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	isAdmin, err := currentUserIsAdmin(ctx)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if !isAdmin {
		http.Error(w, "Forbidden: the Admin role is required to act as another user", http.StatusForbidden)
		return
	}

	var request struct {
		UserID *int64 `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if request.UserID == nil || *request.UserID <= 0 {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	target, err := userEmailByID(*request.UserID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if target == "" {
		http.Error(w, "No such user", http.StatusNotFound)
		return
	}

	// Acting identity after this request, which is what the client needs to
	// know: the request context still carries the *previous* one, because the
	// middleware resolved it before this handler ran.
	nextActingEmail := target
	if target == authenticatedEmail {
		// Choosing yourself is how you get back: clear rather than store a
		// no-op switch.
		nextActingEmail = authenticatedEmail
		clearActingUserCookie(w)
	} else {
		setActingUserCookie(w, *request.UserID)
		log.Printf("acting-user switch: %s is now acting as %s", authenticatedEmail, target)
	}

	session, err := buildSessionFor(authenticatedEmail, nextActingEmail)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

// HandleClearActingUser returns the Admin to their own account. Always safe to
// call: a Standard user has nothing to clear, and the answer is still their own
// session.
func HandleClearActingUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if auth.GetAuthenticatedEmail(ctx) == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	authenticatedEmail := auth.GetAuthenticatedEmail(ctx)
	wasActing := auth.GetUserEmail(ctx) != authenticatedEmail
	clearActingUserCookie(w)
	if wasActing {
		log.Printf("acting-user switch: %s returned to their own account", authenticatedEmail)
	}

	session, err := buildSessionFor(authenticatedEmail, authenticatedEmail)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

// buildSessionResponse describes the session a request is already in.
func buildSessionResponse(ctx context.Context) (SessionResponse, error) {
	authenticatedEmail := auth.GetAuthenticatedEmail(ctx)
	actingEmail := auth.GetUserEmail(ctx)
	if actingEmail == "" {
		actingEmail = authenticatedEmail
	}
	return buildSessionFor(authenticatedEmail, actingEmail)
}

// buildSessionFor describes the session for an explicit pair of identities.
// Handlers that change the switch use it because the request context still
// holds the identity the middleware resolved, i.e. the one from *before* the
// change.
func buildSessionFor(authenticatedEmail, actingEmail string) (SessionResponse, error) {
	authenticatedUser, err := GetOrCreateUser(authenticatedEmail)
	if err != nil {
		return SessionResponse{}, err
	}

	actingUser := authenticatedUser
	if actingEmail != "" && actingEmail != authenticatedEmail {
		actingUser, err = GetOrCreateUser(actingEmail)
		if err != nil {
			return SessionResponse{}, err
		}
	}

	return SessionResponse{
		AuthenticatedUser: *authenticatedUser,
		ActingUser:        *actingUser,
		IsAdmin:           authenticatedUser.IsAdmin,
		ViewingAsOther:    actingUser.ID != authenticatedUser.ID,
	}, nil
}

// emailHoldsAdminRole reads the Admin flag without creating an account. It is
// the authorization check, so it must never have the side effect of inserting a
// row for an address that merely guessed its way past Cloudflare.
func emailHoldsAdminRole(email string) (bool, error) {
	var isAdmin bool
	err := database.DB.QueryRow(`SELECT is_admin FROM users WHERE email = ?`, email).Scan(&isAdmin)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return isAdmin, nil
}

// userEmailByID returns the account's email, or "" when no such account exists.
func userEmailByID(id int64) (string, error) {
	var email string
	err := database.DB.QueryRow(`SELECT email FROM users WHERE id = ?`, id).Scan(&email)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return email, nil
}

func setActingUserCookie(w http.ResponseWriter, userID int64) {
	http.SetCookie(w, &http.Cookie{
		Name:  ActingUserCookieName,
		Value: strconv.FormatInt(userID, 10),
		Path:  "/",
		// Cloudflare terminates TLS, so the origin sees plain HTTP and the
		// cookie must stay sendable there — exactly like the DEV cookie.
		MaxAge:   actingUserCookieMaxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearActingUserCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     ActingUserCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}
