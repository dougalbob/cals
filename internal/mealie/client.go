package mealie

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is a minimal Mealie API client.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// RecipeSummary is the lightweight result returned by search.
type RecipeSummary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// RecipeIngredient represents a single ingredient line from Mealie.
type RecipeIngredient struct {
	Note     string `json:"note"`
	Display  string `json:"display"`
	Quantity any    `json:"quantity"`
	Unit     *struct {
		Name string `json:"name"`
	} `json:"unit"`
	Food *struct {
		Name string `json:"name"`
	} `json:"food"`
}

// RecipeStep represents one instruction step.
type RecipeStep struct {
	Text string `json:"text"`
}

// RecipeDetail holds full recipe information needed for import.
type RecipeDetail struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	Slug         string             `json:"slug"`
	Description  string             `json:"description"`
	RecipeYield  string             `json:"recipeYield"`
	Ingredients  []RecipeIngredient `json:"recipeIngredient"`
	Instructions []RecipeStep       `json:"recipeInstructions"`
}

// NewClient creates a Mealie client.
func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// SearchRecipes returns a list of recipe summaries matching the query.
func (c *Client) SearchRecipes(query string) ([]RecipeSummary, error) {
	endpoint := fmt.Sprintf("%s/api/recipes?search=%s&perPage=25", c.baseURL, url.QueryEscape(query))
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mealie search returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result struct {
		Items []RecipeSummary `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("mealie search decode error: %w", err)
	}
	return result.Items, nil
}

// GetRecipe returns full recipe detail for the given recipe ID or slug.
func (c *Client) GetRecipe(id string) (*RecipeDetail, error) {
	endpoint := fmt.Sprintf("%s/api/recipes/%s", c.baseURL, url.PathEscape(id))
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mealie get recipe returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var detail RecipeDetail
	if err := json.NewDecoder(resp.Body).Decode(&detail); err != nil {
		return nil, fmt.Errorf("mealie recipe decode error: %w", err)
	}
	return &detail, nil
}

func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
}
