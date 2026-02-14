package fatsecret

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Client struct {
	clientID     string
	clientSecret string
	accessToken  string
	tokenExpiry  time.Time
	mutex        sync.RWMutex
	httpClient   *http.Client
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

type SearchResponse struct {
	Foods struct {
		Food         json.RawMessage `json:"food"`
		MaxResults   string          `json:"max_results"`
		PageNumber   string          `json:"page_number"`
		TotalResults string          `json:"total_results"`
	} `json:"foods"`
}

type FoodResult struct {
	FoodID          string `json:"food_id"`
	FoodName        string `json:"food_name"`
	FoodType        string `json:"food_type"`
	BrandName       string `json:"brand_name,omitempty"`
	FoodDescription string `json:"food_description"`
	FoodURL         string `json:"food_url"`
}

type FoodDetailResponse struct {
	Food FoodDetail `json:"food"`
}

type FoodDetail struct {
	FoodID    string `json:"food_id"`
	FoodName  string `json:"food_name"`
	FoodType  string `json:"food_type"`
	BrandName string `json:"brand_name,omitempty"`
	Servings  struct {
		Serving json.RawMessage `json:"serving"`
	} `json:"servings"`
}

type ServingDetail struct {
	ServingID           string `json:"serving_id"`
	ServingDescription  string `json:"serving_description"`
	MetricServingAmount string `json:"metric_serving_amount,omitempty"`
	MetricServingUnit   string `json:"metric_serving_unit,omitempty"`
	Calories            string `json:"calories"`
	Carbohydrate        string `json:"carbohydrate"`
	Protein             string `json:"protein"`
	Fat                 string `json:"fat"`
	Fiber               string `json:"fiber,omitempty"`
	Sugar               string `json:"sugar,omitempty"`
}

func NewClient(clientID, clientSecret string) *Client {
	return &Client{
		clientID:     clientID,
		clientSecret: clientSecret,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *Client) GetAccessToken() (string, error) {
	c.mutex.RLock()
	if c.accessToken != "" && time.Now().Before(c.tokenExpiry) {
		token := c.accessToken
		c.mutex.RUnlock()
		return token, nil
	}
	c.mutex.RUnlock()

	c.mutex.Lock()
	defer c.mutex.Unlock()

	// Double-check after acquiring write lock
	if c.accessToken != "" && time.Now().Before(c.tokenExpiry) {
		return c.accessToken, nil
	}

	// Request new token
	data := url.Values{}
	data.Set("grant_type", "client_credentials")
	data.Set("scope", "basic")

	req, err := http.NewRequest("POST", "https://oauth.fatsecret.com/connect/token", strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}

	req.SetBasicAuth(c.clientID, c.clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("token request failed: %s - %s", resp.Status, string(body))
	}

	var tokenResp tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}

	c.accessToken = tokenResp.AccessToken
	// Set expiry 5 minutes before actual expiry for safety
	c.tokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn-300) * time.Second)

	return c.accessToken, nil
}

func (c *Client) SearchFoods(query string, maxResults int) ([]FoodResult, error) {
	token, err := c.GetAccessToken()
	if err != nil {
		return nil, fmt.Errorf("failed to get access token: %w", err)
	}

	params := url.Values{}
	params.Set("method", "foods.search")
	params.Set("search_expression", query)
	params.Set("format", "json")
	params.Set("max_results", fmt.Sprintf("%d", maxResults))

	reqURL := fmt.Sprintf("https://platform.fatsecret.com/rest/server.api?%s", params.Encode())

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("search request failed: %s - %s", resp.Status, string(body))
	}

	var searchResp SearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, fmt.Errorf("json parse error: %w - body: %s", err, string(body))
	}

	// Handle the case where food can be an array or a single object
	if searchResp.Foods.Food == nil || string(searchResp.Foods.Food) == "null" {
		return []FoodResult{}, nil
	}

	var results []FoodResult
	
	// Try to parse as array first
	if err := json.Unmarshal(searchResp.Foods.Food, &results); err != nil {
		// Try as single object
		var single FoodResult
		if err := json.Unmarshal(searchResp.Foods.Food, &single); err != nil {
			return nil, fmt.Errorf("failed to parse food results: %w", err)
		}
		results = []FoodResult{single}
	}

	return results, nil
}

func (c *Client) GetFood(foodID string) (*FoodDetail, error) {
	token, err := c.GetAccessToken()
	if err != nil {
		return nil, fmt.Errorf("failed to get access token: %w", err)
	}

	params := url.Values{}
	params.Set("method", "food.get.v4")
	params.Set("food_id", foodID)
	params.Set("format", "json")

	reqURL := fmt.Sprintf("https://platform.fatsecret.com/rest/server.api?%s", params.Encode())

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("get food request failed: %s - %s", resp.Status, string(body))
	}

	var foodResp FoodDetailResponse
	if err := json.Unmarshal(body, &foodResp); err != nil {
		return nil, fmt.Errorf("json parse error: %w", err)
	}

	return &foodResp.Food, nil
}

// ParseServings parses the serving data which can be an array or single object
func (c *Client) ParseServings(raw json.RawMessage) ([]ServingDetail, error) {
	if raw == nil || string(raw) == "null" {
		return []ServingDetail{}, nil
	}

	var servings []ServingDetail
	if err := json.Unmarshal(raw, &servings); err != nil {
		// Try single object
		var single ServingDetail
		if err := json.Unmarshal(raw, &single); err != nil {
			return nil, err
		}
		servings = []ServingDetail{single}
	}
	return servings, nil
}
