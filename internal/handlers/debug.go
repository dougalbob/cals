package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// HandleTestFatSecret tests the FatSecret API connection with raw output
func HandleTestFatSecret(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		query = "banana"
	}

	if FatSecretClient == nil {
		http.Error(w, "FatSecret client not initialized", http.StatusInternalServerError)
		return
	}

	// Get token first
	token, err := FatSecretClient.GetAccessToken()
	if err != nil {
		http.Error(w, "Token error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Make raw request to see full response
	params := url.Values{}
	params.Set("method", "foods.search")
	params.Set("search_expression", query)
	params.Set("format", "json")
	params.Set("max_results", "5")

	reqURL := fmt.Sprintf("https://platform.fatsecret.com/rest/server.api?%s", params.Encode())

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		http.Error(w, "Request error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "API error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	// Return debug info
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      resp.StatusCode,
		"token_start": token[:20] + "...",
		"url":         reqURL,
		"raw_body":    string(body),
	})
}
