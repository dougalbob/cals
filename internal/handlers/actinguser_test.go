package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"cals/internal/auth"
	"cals/internal/database"
)

// swapRequest builds a request whose Cookie header carries an acting-user
// switch, the way a browser would send it back.
func swapRequest(t *testing.T, method, target, body, email string, actingUserID int64) *http.Request {
	t.Helper()
	req := authedRequest(t, method, target, body, email)
	req.AddCookie(&http.Cookie{Name: ActingUserCookieName, Value: itoa(actingUserID)})
	return req
}

// actingEmailFrom runs a request through the acting-user middleware and
// reports which identity the handler would have seen.
func actingEmailFrom(t *testing.T, req *http.Request) string {
	t.Helper()
	var seen string
	recorder := httptest.NewRecorder()
	ActingUserMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = auth.GetUserEmail(r.Context())
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("middleware status = %d, want 200", recorder.Code)
	}
	return seen
}

func TestActingUserSwitchIsIgnoredWithoutACookie(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	for _, email := range []string{"owner@example.com", "wife@example.com"} {
		req := authedRequest(t, http.MethodGet, "/api/diary", "", email)
		if got := actingEmailFrom(t, req); got != email {
			t.Errorf("acting email for %s = %q, want %q", email, got, email)
		}
	}
}

func TestAdminCookieSwitchesTheActingUser(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	req := swapRequest(t, http.MethodGet, "/api/diary", "", "owner@example.com", wifeID)
	if got := actingEmailFrom(t, req); got != "wife@example.com" {
		t.Errorf("acting email = %q, want wife@example.com", got)
	}
}

// The security property the whole design rests on: the cookie is only honoured
// for an Admin, so a Standard user who plants one gains nothing. Cloudflare
// decides who is signed in, and that identity cannot be forged.
func TestStandardUserCookieIsIgnored(t *testing.T) {
	setupHandlerDB(t)
	ownerID := createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	req := swapRequest(t, http.MethodGet, "/api/diary", "", "wife@example.com", ownerID)
	recorder := httptest.NewRecorder()
	ActingUserMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := auth.GetUserEmail(r.Context()); got != "wife@example.com" {
			t.Errorf("acting email = %q, want the standard user's own account", got)
		}
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(recorder, req)

	// A rejected cookie is also cleared, so the browser stops resending it.
	cookies := recorder.Result().Cookies()
	found := false
	for _, cookie := range cookies {
		if cookie.Name == ActingUserCookieName {
			found = true
			if cookie.MaxAge >= 0 {
				t.Errorf("cookie MaxAge = %d, want an expiry (negative) so it is deleted", cookie.MaxAge)
			}
		}
	}
	if !found {
		t.Error("a rejected acting-user cookie was not cleared")
	}
}

func TestStaleAndMalformedCookiesAreIgnored(t *testing.T) {
	setupHandlerDB(t)
	ownerID := createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	for _, cookieValue := range []string{"not-a-number", "-1", "0", "999999"} {
		req := authedRequest(t, http.MethodGet, "/api/diary", "", "owner@example.com")
		req.AddCookie(&http.Cookie{Name: ActingUserCookieName, Value: cookieValue})
		if got := actingEmailFrom(t, req); got != "owner@example.com" {
			t.Errorf("cookie %q: acting email = %q, want the admin's own account", cookieValue, got)
		}
	}

	// Switching to yourself is not a switch.
	if got := actingEmailFrom(t, swapRequest(t, http.MethodGet, "/api/diary", "", "owner@example.com", ownerID)); got != "owner@example.com" {
		t.Errorf("cookie naming your own account: acting email = %q, want unchanged", got)
	}
}

func getSession(t *testing.T, req *http.Request) SessionResponse {
	t.Helper()
	recorder := httptest.NewRecorder()
	ActingUserMiddleware(http.HandlerFunc(HandleGetSession)).ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/session status = %d, body %s", recorder.Code, recorder.Body.String())
	}
	var session SessionResponse
	if err := json.NewDecoder(recorder.Body).Decode(&session); err != nil {
		t.Fatalf("decoding session: %v", err)
	}
	return session
}

func TestSessionReportsBothIdentities(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	own := getSession(t, authedRequest(t, http.MethodGet, "/api/session", "", "owner@example.com"))
	if own.ViewingAsOther {
		t.Error("ViewingAsOther = true on the Admin's own account, want false")
	}
	if !own.IsAdmin {
		t.Error("IsAdmin = false, want true")
	}
	if own.ActingUser.Email != "owner@example.com" || own.AuthenticatedUser.Email != "owner@example.com" {
		t.Errorf("session = acting %s / authenticated %s, want both owner@example.com", own.ActingUser.Email, own.AuthenticatedUser.Email)
	}

	swapped := getSession(t, swapRequest(t, http.MethodGet, "/api/session", "", "owner@example.com", wifeID))
	if !swapped.ViewingAsOther {
		t.Error("ViewingAsOther = false while acting as someone else, want true")
	}
	if swapped.ActingUser.Email != "wife@example.com" {
		t.Errorf("acting user = %s, want wife@example.com", swapped.ActingUser.Email)
	}
	if swapped.AuthenticatedUser.Email != "owner@example.com" {
		t.Errorf("authenticated user = %s, want the Admin's own account (the way back)", swapped.AuthenticatedUser.Email)
	}
	// The Admin must keep the capability while acting as the other person.
	if !swapped.IsAdmin {
		t.Error("IsAdmin = false while acting as someone else, want true so the Admin can swap back")
	}

	standard := getSession(t, authedRequest(t, http.MethodGet, "/api/session", "", "wife@example.com"))
	if standard.IsAdmin || standard.ViewingAsOther {
		t.Errorf("standard session = admin %v / viewing as other %v, want both false", standard.IsAdmin, standard.ViewingAsOther)
	}
}

func postActingUser(t *testing.T, email, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	HandleSetActingUser(recorder, authedRequest(t, http.MethodPost, "/api/session/acting-user", body, email))
	return recorder
}

func TestSetActingUserIsAdminOnlyAndValidatesTheTarget(t *testing.T) {
	setupHandlerDB(t)
	ownerID := createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	if recorder := postActingUser(t, "wife@example.com", `{"user_id":1}`); recorder.Code != http.StatusForbidden {
		t.Errorf("POST as a standard user status = %d, want 403", recorder.Code)
	}
	if recorder := postActingUser(t, "owner@example.com", `{"user_id":999999}`); recorder.Code != http.StatusNotFound {
		t.Errorf("POST with an unknown id status = %d, want 404", recorder.Code)
	}
	if recorder := postActingUser(t, "owner@example.com", `not json`); recorder.Code != http.StatusBadRequest {
		t.Errorf("POST with invalid JSON status = %d, want 400", recorder.Code)
	}
	if recorder := postActingUser(t, "owner@example.com", `{}`); recorder.Code != http.StatusBadRequest {
		t.Errorf("POST without user_id status = %d, want 400", recorder.Code)
	}

	recorder := postActingUser(t, "owner@example.com", `{"user_id":`+itoa(wifeID)+`}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("POST as admin status = %d, want 200 (body %s)", recorder.Code, recorder.Body.String())
	}
	var cookie *http.Cookie
	for _, candidate := range recorder.Result().Cookies() {
		if candidate.Name == ActingUserCookieName {
			cookie = candidate
		}
	}
	if cookie == nil {
		t.Fatal("no acting-user cookie was set")
	}
	if cookie.Value != itoa(wifeID) {
		t.Errorf("cookie value = %s, want the target id %d", cookie.Value, wifeID)
	}
	if !cookie.HttpOnly {
		t.Error("cookie is not HttpOnly; the acting-user switch must not be readable by scripts")
	}

	var session SessionResponse
	if err := json.NewDecoder(recorder.Body).Decode(&session); err != nil {
		t.Fatalf("decoding the switch response: %v", err)
	}
	if !session.ViewingAsOther || session.ActingUser.Email != "wife@example.com" {
		t.Errorf("session after switching = viewing_as_other %v / acting %s, want true and wife@example.com", session.ViewingAsOther, session.ActingUser.Email)
	}

	// Choosing yourself is the way back: no switch is stored.
	back := postActingUser(t, "owner@example.com", `{"user_id":`+itoa(ownerID)+`}`)
	if back.Code != http.StatusOK {
		t.Fatalf("POST returning to self status = %d, want 200", back.Code)
	}
	for _, candidate := range back.Result().Cookies() {
		if candidate.Name == ActingUserCookieName && candidate.MaxAge >= 0 {
			t.Errorf("returning to self left a live cookie (MaxAge %d)", candidate.MaxAge)
		}
	}
	var ownSession SessionResponse
	if err := json.NewDecoder(back.Body).Decode(&ownSession); err != nil {
		t.Fatalf("decoding the return response: %v", err)
	}
	if ownSession.ViewingAsOther {
		t.Error("ViewingAsOther = true after choosing yourself, want false")
	}
}

func TestClearActingUserReturnsToTheAdminAccount(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	req := swapRequest(t, http.MethodDelete, "/api/session/acting-user", "", "owner@example.com", wifeID)
	ActingUserMiddleware(http.HandlerFunc(HandleClearActingUser)).ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("DELETE status = %d, want 200 (body %s)", recorder.Code, recorder.Body.String())
	}

	var session SessionResponse
	if err := json.NewDecoder(recorder.Body).Decode(&session); err != nil {
		t.Fatalf("decoding session: %v", err)
	}
	if session.ViewingAsOther || session.ActingUser.Email != "owner@example.com" {
		t.Errorf("session after clearing = viewing_as_other %v / acting %s, want false and owner@example.com", session.ViewingAsOther, session.ActingUser.Email)
	}
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == ActingUserCookieName && cookie.MaxAge >= 0 {
			t.Errorf("clearing left a live cookie (MaxAge %d)", cookie.MaxAge)
		}
	}

	// A standard user may clear too — it is their own session either way.
	standardRecorder := httptest.NewRecorder()
	HandleClearActingUser(standardRecorder, authedRequest(t, http.MethodDelete, "/api/session/acting-user", "", "wife@example.com"))
	if standardRecorder.Code != http.StatusOK {
		t.Errorf("DELETE as a standard user status = %d, want 200", standardRecorder.Code)
	}
}

// The reason authorization reads the authenticated identity: while the Admin is
// viewing another account they must still reach the list of accounts, or the
// way back would be gone.
func TestAdminKeepsTheAccountListWhileActingAsSomeoneElse(t *testing.T) {
	setupHandlerDB(t)
	createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	req := swapRequest(t, http.MethodGet, "/api/users", "", "owner@example.com", wifeID)
	ActingUserMiddleware(http.HandlerFunc(HandleListUsers)).ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Errorf("GET /api/users while acting as the other account status = %d, want 200 (body %s)", recorder.Code, recorder.Body.String())
	}
}

// Decision 45: full read/write. A row written while swapped belongs to the
// person being acted as, exactly as if they had logged it.
func TestDiaryWritesWhileSwappedBelongToTheActingUser(t *testing.T) {
	setupHandlerDB(t)
	ownerID := createTestUser(t, "owner@example.com", "2026-09-01", 2000)
	wifeID := createTestUser(t, "wife@example.com", "2026-09-01", 1500)
	setTestRoles(t, []string{"owner@example.com"}, []string{"wife@example.com"})
	if _, err := ApplyConfiguredRoles(); err != nil {
		t.Fatalf("ApplyConfiguredRoles() error = %v", err)
	}
	foodID := createTestFood(t)

	recorder := httptest.NewRecorder()
	body := `{"date":"2026-09-05","meal":"lunch","food_id":` + itoa(foodID) +
		`,"quantity_grams":100,"calories":150,"protein":1,"carbs":2,"fat":3,"fibre":0}`
	// The Admin's own request, carrying a switch to his wife's account.
	req := swapRequest(t, http.MethodPost, "/api/diary", body, "owner@example.com", wifeID)
	ActingUserMiddleware(http.HandlerFunc(HandleCreateDiaryEntry)).ServeHTTP(recorder, req)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("POST /api/diary while swapped status = %d, want 201 (body %s)", recorder.Code, recorder.Body.String())
	}

	var storedUserID int64
	if err := database.DB.QueryRow(`SELECT user_id FROM diary_entries WHERE date = '2026-09-05'`).Scan(&storedUserID); err != nil {
		t.Fatalf("reading the stored diary row: %v", err)
	}
	if storedUserID != wifeID {
		t.Errorf("stored user_id = %d, want %d (the account being acted as)", storedUserID, wifeID)
	}
	if storedUserID == ownerID {
		t.Error("the row was attributed to the Admin, not to the account being acted as")
	}
}
