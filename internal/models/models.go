package models

import (
	"database/sql"
	"time"
)

// User represents an authenticated user
type User struct {
	ID               int64     `json:"id"`
	Email            string    `json:"email"`
	Name             string    `json:"name"`
	DailyCalorieGoal int       `json:"daily_calorie_goal"`
	DailyWaterGoalML int       `json:"daily_water_goal_ml"`
	WeightUnit       string    `json:"weight_unit"`
	BankStartDate    string    `json:"bank_start_date"`
	TargetWeightKG   *float64  `json:"target_weight_kg,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// Food represents a food item
type Food struct {
	ID              int64           `json:"id"`
	FatSecretID     sql.NullString  `json:"fatsecret_id,omitempty"`
	Name            string          `json:"name"`
	Brand           sql.NullString  `json:"brand,omitempty"`
	CaloriesPer100g float64         `json:"calories_per_100g"`
	ProteinPer100g  float64         `json:"protein_per_100g"`
	CarbsPer100g    float64         `json:"carbs_per_100g"`
	FatPer100g      float64         `json:"fat_per_100g"`
	FibrePer100g    float64         `json:"fibre_per_100g"`
	ServingName     sql.NullString  `json:"serving_name,omitempty"`
	ServingGrams    sql.NullFloat64 `json:"serving_grams,omitempty"`
	IsEdited        bool            `json:"is_edited"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
	Servings        []FoodServing   `json:"servings,omitempty"`
}

// FoodServing represents a predefined serving size
type FoodServing struct {
	ID                 int64          `json:"id"`
	FoodID             int64          `json:"food_id"`
	FatSecretServingID sql.NullString `json:"fatsecret_serving_id,omitempty"`
	Description        string         `json:"description"`
	Grams              float64        `json:"grams"`
}

// Recipe represents a user-created recipe
type Recipe struct {
	ID                    int64                  `json:"id"`
	Name                  string                 `json:"name"`
	Description           string                 `json:"description,omitempty"`
	Instructions          string                 `json:"instructions,omitempty"`
	ImageFilename         string                 `json:"image_filename,omitempty"`
	Serves                int                    `json:"serves"`
	CreatedByUserID       int64                  `json:"created_by_user_id"`
	CreatedByName         string                 `json:"created_by_name,omitempty"`
	CalculatedWeightGrams float64                `json:"calculated_weight_grams"`
	TotalWeightGrams      float64                `json:"total_weight_grams"`
	WeightIsManual        bool                   `json:"weight_is_manual"`
	TotalCalories         float64                `json:"total_calories"`
	TotalProtein          float64                `json:"total_protein"`
	TotalCarbs            float64                `json:"total_carbs"`
	TotalFat              float64                `json:"total_fat"`
	TotalFibre            float64                `json:"total_fibre"`
	CaloriesPer100g       float64                `json:"calories_per_100g"`
	ProteinPer100g        float64                `json:"protein_per_100g"`
	CarbsPer100g          float64                `json:"carbs_per_100g"`
	FatPer100g            float64                `json:"fat_per_100g"`
	FibrePer100g          float64                `json:"fibre_per_100g"`
	CreatedAt             time.Time              `json:"created_at"`
	UpdatedAt             time.Time              `json:"updated_at"`
	IsFavourite           bool                   `json:"is_favourite"`
	IsArchived            bool                   `json:"is_archived"` // household-wide (decision 59): hidden from the catalogue and not loggable, history untouched
	UsualGrams            *float64               `json:"usual_grams"` // signed-in user's remembered portion; null until they first log it
	MealOccasions         []string               `json:"meal_occasions"`
	DishType              string                 `json:"dish_type,omitempty"`
	KeyFoods              []RecipeKeyFood        `json:"key_foods"`
	TotalTimeMinutes      *int                   `json:"total_time_minutes"`
	Ingredients           []RecipeIngredient     `json:"ingredients,omitempty"`
	TextIngredients       []RecipeTextIngredient `json:"text_ingredients,omitempty"`
}

// RecipeKeyFood is a known cals Food selected as a recipe's key ingredient.
type RecipeKeyFood struct {
	FoodID   int64  `json:"food_id"`
	FoodName string `json:"food_name"`
}

// RecipeIngredient represents a food ingredient in a recipe
type RecipeIngredient struct {
	ID            int64   `json:"id"`
	RecipeID      int64   `json:"recipe_id"`
	FoodID        int64   `json:"food_id"`
	FoodName      string  `json:"food_name,omitempty"`
	QuantityGrams float64 `json:"quantity_grams"`
	Calories      float64 `json:"calories,omitempty"`
	SortOrder     int     `json:"sort_order"`
}

// RecipeTextIngredient represents a free-text ingredient (no calories)
type RecipeTextIngredient struct {
	ID          int64  `json:"id"`
	RecipeID    int64  `json:"recipe_id"`
	Description string `json:"description"`
	SortOrder   int    `json:"sort_order"`
}

// DiaryEntry represents a logged food or recipe
type DiaryEntry struct {
	ID            int64         `json:"id"`
	UserID        int64         `json:"user_id"`
	Date          string        `json:"date"`
	Meal          string        `json:"meal"`
	FoodID        sql.NullInt64 `json:"food_id,omitempty"`
	RecipeID      sql.NullInt64 `json:"recipe_id,omitempty"`
	QuantityGrams float64       `json:"quantity_grams"`
	Calories      float64       `json:"calories"`
	Protein       float64       `json:"protein"`
	Carbs         float64       `json:"carbs"`
	Fat           float64       `json:"fat"`
	Fibre         float64       `json:"fibre"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
	FoodName      string        `json:"food_name,omitempty"`
	RecipeName    string        `json:"recipe_name,omitempty"`
}

// WaterEntry represents a water intake log
type WaterEntry struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Date      string    `json:"date"`
	AmountML  int       `json:"amount_ml"`
	CreatedAt time.Time `json:"created_at"`
}

// WeightEntry represents a weight log
type WeightEntry struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Date      string    `json:"date"`
	WeightKG  float64   `json:"weight_kg"`
	CreatedAt time.Time `json:"created_at"`
}

// MeasurementEntry represents body measurements
type MeasurementEntry struct {
	ID         int64           `json:"id"`
	UserID     int64           `json:"user_id"`
	Date       string          `json:"date"`
	BustCM     sql.NullFloat64 `json:"bust_cm,omitempty"`
	ChestCM    sql.NullFloat64 `json:"chest_cm,omitempty"`
	WaistCM    sql.NullFloat64 `json:"waist_cm,omitempty"`
	HipsCM     sql.NullFloat64 `json:"hips_cm,omitempty"`
	UpperArmCM sql.NullFloat64 `json:"upper_arm_cm,omitempty"`
	ThighCM    sql.NullFloat64 `json:"thigh_cm,omitempty"`
	NeckCM     sql.NullFloat64 `json:"neck_cm,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
}

// WeightGoal represents a monthly weight loss target
type WeightGoal struct {
	ID            int64     `json:"id"`
	UserID        int64     `json:"user_id"`
	Month         string    `json:"month"`
	TargetLossKG  float64   `json:"target_loss_kg"`
	StartWeightKG float64   `json:"start_weight_kg"`
	CreatedAt     time.Time `json:"created_at"`
}

// DailyNote represents a note for a specific day
type DailyNote struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Date      string    `json:"date"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
