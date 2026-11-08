package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
)

var (
	fitClientID     string
	fitClientSecret string
	fitRedirectURI  string
)

func InitFitness() {
	fitClientID = os.Getenv("GOOGLE_FIT_CLIENT_ID")
	fitClientSecret = os.Getenv("GOOGLE_FIT_CLIENT_SECRET")
	fitRedirectURI = "https://cals.duncandoes.uk/api/fit/callback"
}

// HandleFitAuth initiates the OAuth flow
func HandleFitAuth(w http.ResponseWriter, r *http.Request) {
	if fitClientID == "" {
		http.Error(w, "Google Fit not configured", http.StatusServiceUnavailable)
		return
	}

	scope := "https://www.googleapis.com/auth/fitness.activity.read"
	authURL := fmt.Sprintf(
		"https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&access_type=offline&prompt=consent",
		url.QueryEscape(fitClientID),
		url.QueryEscape(fitRedirectURI),
		url.QueryEscape(scope),
	)

	http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
}

// HandleFitCallback handles the OAuth callback
func HandleFitCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "No authorization code", http.StatusBadRequest)
		return
	}

	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Exchange code for tokens
	tokenResp, err := exchangeCodeForTokens(code)
	if err != nil {
		http.Error(w, "Failed to exchange code: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Calculate expiry time
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// Store tokens
	_, err = database.DB.Exec(`
		INSERT INTO fit_tokens (user_id, access_token, refresh_token, expires_at, updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET
			access_token = excluded.access_token,
			refresh_token = COALESCE(excluded.refresh_token, fit_tokens.refresh_token),
			expires_at = excluded.expires_at,
			updated_at = CURRENT_TIMESTAMP
	`, userID, tokenResp.AccessToken, tokenResp.RefreshToken, expiresAt)
	if err != nil {
		http.Error(w, "Failed to store tokens: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Sync initial step data
	go syncStepsForUser(userID, tokenResp.AccessToken)

	// Redirect back to the app
	http.Redirect(w, r, "/?fit=connected", http.StatusTemporaryRedirect)
}

// HandleFitStatus returns whether user has connected Google Fit
func HandleFitStatus(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	var expiresAt time.Time
	err = database.DB.QueryRow(`SELECT expires_at FROM fit_tokens WHERE user_id = ?`, userID).Scan(&expiresAt)
	
	connected := err == nil
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"connected": connected,
	})
}

// HandleFitDisconnect removes the Google Fit connection
func HandleFitDisconnect(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	database.DB.Exec(`DELETE FROM fit_tokens WHERE user_id = ?`, userID)
	database.DB.Exec(`DELETE FROM step_entries WHERE user_id = ?`, userID)

	w.WriteHeader(http.StatusNoContent)
}

// HandleGetSteps returns step data for a date range
func HandleGetSteps(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Try to refresh data if needed
	go refreshStepsIfNeeded(userID)

	// Window: an explicit from/to pair, or the legacy `days` parameter counting
	// back from today (14 by default). date(date) keeps the JSON at plain
	// YYYY-MM-DD instead of the RFC3339 the driver returns for a DATE column.
	from, to, ok := resolveSeriesRange(w, r, 14, 0, false)
	if !ok {
		return
	}

	rows, err := database.DB.Query(`
		SELECT date(date) AS day, steps FROM step_entries
		WHERE user_id = ? AND date >= date(?) AND date <= date(?)
		ORDER BY day ASC
	`, userID, from, to)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var entries []map[string]interface{}
	for rows.Next() {
		var date string
		var steps int
		if err := rows.Scan(&date, &steps); err != nil {
			continue
		}
		entries = append(entries, map[string]interface{}{
			"date":  isoDate(date),
			"steps": steps,
		})
	}

	if entries == nil {
		entries = []map[string]interface{}{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

// HandleSyncSteps manually triggers a sync
func HandleSyncSteps(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	token, err := getValidToken(userID)
	if err != nil {
		http.Error(w, "Not connected to Google Fit", http.StatusBadRequest)
		return
	}

	err = syncStepsForUser(userID, token)
	if err != nil {
		http.Error(w, "Sync failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "synced"})
}

// Token response from Google
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

func exchangeCodeForTokens(code string) (*TokenResponse, error) {
	data := url.Values{}
	data.Set("code", code)
	data.Set("client_id", fitClientID)
	data.Set("client_secret", fitClientSecret)
	data.Set("redirect_uri", fitRedirectURI)
	data.Set("grant_type", "authorization_code")

	resp, err := http.PostForm("https://oauth2.googleapis.com/token", data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("token exchange failed: %s", string(body))
	}

	var tokenResp TokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, err
	}

	return &tokenResp, nil
}

func refreshAccessToken(userID int64, refreshToken string) (string, error) {
	data := url.Values{}
	data.Set("client_id", fitClientID)
	data.Set("client_secret", fitClientSecret)
	data.Set("refresh_token", refreshToken)
	data.Set("grant_type", "refresh_token")

	resp, err := http.PostForm("https://oauth2.googleapis.com/token", data)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("token refresh failed: %s", string(body))
	}

	var tokenResp TokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", err
	}

	// Update stored token
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
	database.DB.Exec(`
		UPDATE fit_tokens SET access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`, tokenResp.AccessToken, expiresAt, userID)

	return tokenResp.AccessToken, nil
}

func getValidToken(userID int64) (string, error) {
	var accessToken, refreshToken string
	var expiresAt time.Time

	err := database.DB.QueryRow(`
		SELECT access_token, refresh_token, expires_at FROM fit_tokens WHERE user_id = ?
	`, userID).Scan(&accessToken, &refreshToken, &expiresAt)
	if err != nil {
		return "", err
	}

	// Check if token is expired or about to expire (5 min buffer)
	if time.Now().Add(5 * time.Minute).After(expiresAt) {
		return refreshAccessToken(userID, refreshToken)
	}

	return accessToken, nil
}

func refreshStepsIfNeeded(userID int64) {
	var syncedAt sql.NullTime
	database.DB.QueryRow(`
		SELECT MAX(synced_at) FROM step_entries WHERE user_id = ?
	`, userID).Scan(&syncedAt)

	// Sync if no data or last sync was more than 1 hour ago
	if !syncedAt.Valid || time.Since(syncedAt.Time) > time.Hour {
		token, err := getValidToken(userID)
		if err == nil {
			syncStepsForUser(userID, token)
		}
	}
}

func syncStepsForUser(userID int64, accessToken string) error {
	// Get steps for last 14 days
	now := time.Now()
	startTime := now.AddDate(0, 0, -14).Truncate(24 * time.Hour)
	endTime := now.Truncate(24 * time.Hour).Add(24 * time.Hour)

	startMillis := startTime.UnixMilli()
	endMillis := endTime.UnixMilli()

	// Build the aggregate request
	reqBody := map[string]interface{}{
		"aggregateBy": []map[string]string{
			{"dataTypeName": "com.google.step_count.delta"},
		},
		"bucketByTime": map[string]int64{
			"durationMillis": 86400000, // 1 day
		},
		"startTimeMillis": startMillis,
		"endTimeMillis":   endMillis,
	}

	jsonBody, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST",
		"https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
		bytes.NewBuffer(jsonBody))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("API error: %s", string(body))
	}

	// Parse response
	var result struct {
		Bucket []struct {
			StartTimeMillis string `json:"startTimeMillis"`
			Dataset         []struct {
				Point []struct {
					Value []struct {
						IntVal int `json:"intVal"`
					} `json:"value"`
				} `json:"point"`
			} `json:"dataset"`
		} `json:"bucket"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return err
	}

	// Store each day's steps
	for _, bucket := range result.Bucket {
		var startMillis int64
		fmt.Sscanf(bucket.StartTimeMillis, "%d", &startMillis)
		date := time.UnixMilli(startMillis).Format("2006-01-02")

		steps := 0
		if len(bucket.Dataset) > 0 && len(bucket.Dataset[0].Point) > 0 {
			for _, point := range bucket.Dataset[0].Point {
				if len(point.Value) > 0 {
					steps += point.Value[0].IntVal
				}
			}
		}

		database.DB.Exec(`
			INSERT INTO step_entries (user_id, date, steps, synced_at)
			VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(user_id, date) DO UPDATE SET steps = excluded.steps, synced_at = CURRENT_TIMESTAMP
		`, userID, date, steps)
	}

	return nil
}
