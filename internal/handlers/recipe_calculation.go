package handlers

import (
	"database/sql"
	"fmt"
	"math"
)

type recipeIngredientInput struct {
	FoodID        int64   `json:"food_id"`
	QuantityGrams float64 `json:"quantity_grams"`
	SortOrder     int     `json:"sort_order"`
}

type recipeFoodNotFoundError struct {
	foodID int64
}

func (err recipeFoodNotFoundError) Error() string {
	return fmt.Sprintf("Food %d was not found", err.foodID)
}

func (err recipeFoodNotFoundError) Unwrap() error {
	return sql.ErrNoRows
}

type recipeTextIngredientInput struct {
	Description string `json:"description"`
	SortOrder   int    `json:"sort_order"`
}

type recipeNutritionTotals struct {
	CalculatedWeightGrams float64
	Calories              float64
	Protein               float64
	Carbs                 float64
	Fat                   float64
	Fibre                 float64
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func isFinitePositive(value float64) bool {
	return value > 0 && isFinite(value)
}

func (totals recipeNutritionTotals) isFinite() bool {
	return isFinite(totals.CalculatedWeightGrams) && isFinite(totals.Calories) &&
		isFinite(totals.Protein) && isFinite(totals.Carbs) && isFinite(totals.Fat) && isFinite(totals.Fibre)
}

func (totals *recipeNutritionTotals) add(quantityGrams, caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fibrePer100g float64) {
	factor := quantityGrams / 100
	totals.Calories += caloriesPer100g * factor
	totals.Protein += proteinPer100g * factor
	totals.Carbs += carbsPer100g * factor
	totals.Fat += fatPer100g * factor
	totals.Fibre += fibrePer100g * factor
	totals.CalculatedWeightGrams += quantityGrams
}

func calculateRecipeNutrition(tx *sql.Tx, ingredients []recipeIngredientInput) (recipeNutritionTotals, error) {
	var totals recipeNutritionTotals
	for _, ingredient := range ingredients {
		if !isFinitePositive(ingredient.QuantityGrams) {
			return recipeNutritionTotals{}, fmt.Errorf("food ingredient weights must be finite and greater than zero grams")
		}
		var calories, protein, carbs, fat, fibre float64
		if err := tx.QueryRow(`
			SELECT calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fibre_per_100g
			FROM foods WHERE id = ?
		`, ingredient.FoodID).Scan(&calories, &protein, &carbs, &fat, &fibre); err != nil {
			if err == sql.ErrNoRows {
				return recipeNutritionTotals{}, recipeFoodNotFoundError{foodID: ingredient.FoodID}
			}
			return recipeNutritionTotals{}, err
		}
		totals.add(ingredient.QuantityGrams, calories, protein, carbs, fat, fibre)
		if !totals.isFinite() {
			return recipeNutritionTotals{}, fmt.Errorf("calculated recipe nutrition is outside the supported range")
		}
	}
	return totals, nil
}

// recalculateRecipeNutrition refreshes the definition of a single recipe from
// its current food ingredients. Diary rows are deliberately not consulted: they
// are immutable nutrition snapshots of what was actually logged.
func recalculateRecipeNutrition(tx *sql.Tx, recipeID int64) error {
	var manualWeight bool
	var totalWeight float64
	if err := tx.QueryRow(`
		SELECT weight_is_manual, total_weight_grams FROM recipes WHERE id = ?
	`, recipeID).Scan(&manualWeight, &totalWeight); err != nil {
		return err
	}
	if manualWeight && !isFinitePositive(totalWeight) {
		return fmt.Errorf("manually measured cooked weight must be finite and greater than zero")
	}

	rows, err := tx.Query(`
		SELECT ri.quantity_grams, f.calories_per_100g, f.protein_per_100g,
		       f.carbs_per_100g, f.fat_per_100g, f.fibre_per_100g
		FROM recipe_ingredients ri
		JOIN foods f ON f.id = ri.food_id
		WHERE ri.recipe_id = ?
		ORDER BY ri.sort_order, ri.id
	`, recipeID)
	if err != nil {
		return err
	}

	var totals recipeNutritionTotals
	for rows.Next() {
		var quantity, calories, protein, carbs, fat, fibre float64
		if err := rows.Scan(&quantity, &calories, &protein, &carbs, &fat, &fibre); err != nil {
			rows.Close()
			return err
		}
		if !isFinitePositive(quantity) {
			rows.Close()
			return fmt.Errorf("food ingredient weights must be finite and greater than zero grams")
		}
		totals.add(quantity, calories, protein, carbs, fat, fibre)
		if !totals.isFinite() {
			rows.Close()
			return fmt.Errorf("recipe nutrition is outside the supported range")
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	if !manualWeight {
		totalWeight = totals.CalculatedWeightGrams
	}
	_, err = tx.Exec(`
		UPDATE recipes SET
			calculated_weight_grams = ?, total_weight_grams = ?,
			total_calories = ?, total_protein = ?, total_carbs = ?, total_fat = ?, total_fibre = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, totals.CalculatedWeightGrams, totalWeight, totals.Calories, totals.Protein,
		totals.Carbs, totals.Fat, totals.Fibre, recipeID)
	return err
}

// recalculateRecipesUsingFood refreshes every recipe definition that includes a
// corrected food. Archived recipes are included so restoring one cannot revive
// stale nutrition. The caller owns the transaction shared with the food edit.
func recalculateRecipesUsingFood(tx *sql.Tx, foodID int64) error {
	rows, err := tx.Query(`
		SELECT DISTINCT recipe_id FROM recipe_ingredients WHERE food_id = ? ORDER BY recipe_id
	`, foodID)
	if err != nil {
		return err
	}

	var recipeIDs []int64
	for rows.Next() {
		var recipeID int64
		if err := rows.Scan(&recipeID); err != nil {
			rows.Close()
			return err
		}
		recipeIDs = append(recipeIDs, recipeID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	for _, recipeID := range recipeIDs {
		if err := recalculateRecipeNutrition(tx, recipeID); err != nil {
			return fmt.Errorf("recalculating recipe %d: %w", recipeID, err)
		}
	}
	return nil
}
