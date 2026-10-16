import { describe, expect, it } from 'vitest'
import {
  WHOLE_RECIPE_FRACTIONS,
  canLogRecipePortion,
  fractionGrams,
  maxRecipeGramsWithinDailyCalories,
  matchingFraction,
  recipeNutritionForGrams,
  suggestedMeal,
} from './recipePortion'

const recipe = {
  total_weight_grams: 1050,
  calories_per_100g: 114.29,
  protein_per_100g: 8.1,
  carbs_per_100g: 10.4,
  fat_per_100g: 3.6,
  fibre_per_100g: 0.9,
}

describe('fractionGrams', () => {
  it('takes fractions of the whole cooked recipe, not of one serve', () => {
    expect(fractionGrams(1050, 0.25)).toBe(262.5)
    expect(fractionGrams(1050, 0.5)).toBe(525)
    expect(fractionGrams(1050, 1)).toBe(1050)
  })

  it('refuses to convert without a cooked weight', () => {
    expect(fractionGrams(0, 0.5)).toBeNull()
    expect(fractionGrams(-100, 0.5)).toBeNull()
    expect(fractionGrams(Number.NaN, 0.5)).toBeNull()
  })

  it('offers the four agreed fraction choices', () => {
    expect(WHOLE_RECIPE_FRACTIONS.map((option) => option.fraction)).toEqual([0.25, 0.5, 0.75, 1])
  })
})

describe('matchingFraction', () => {
  it('highlights the chosen fraction', () => {
    expect(matchingFraction(1050, 525)?.label).toBe('½')
    expect(matchingFraction(1050, 787.5)?.label).toBe('¾')
  })

  it('highlights nothing for a hand-typed weight', () => {
    expect(matchingFraction(1050, 333)).toBeNull()
  })
})

describe('recipeNutritionForGrams', () => {
  it('scales the per-100 g values to the chosen weight', () => {
    const snapshot = recipeNutritionForGrams(recipe, 525)
    expect(snapshot).not.toBeNull()
    expect(snapshot?.quantity_grams).toBe(525)
    expect(snapshot?.calories).toBeCloseTo(600.02, 2)
    expect(snapshot?.protein).toBeCloseTo(42.525, 3)
    expect(snapshot?.carbs).toBeCloseTo(54.6, 2)
    expect(snapshot?.fat).toBeCloseTo(18.9, 2)
    expect(snapshot?.fibre).toBeCloseTo(4.73, 2)
  })

  it('refuses a zero weight instead of storing an empty snapshot', () => {
    expect(recipeNutritionForGrams(recipe, 0)).toBeNull()
    expect(recipeNutritionForGrams(recipe, Number.NaN)).toBeNull()
  })
})

describe('canLogRecipePortion', () => {
  it('requires a cooked weight, because zero per-100 g means no nutrition', () => {
    expect(canLogRecipePortion({ total_weight_grams: 780 })).toBe(true)
    expect(canLogRecipePortion({ total_weight_grams: 0 })).toBe(false)
  })
})

describe('maxRecipeGramsWithinDailyCalories', () => {
  const recipe = { total_weight_grams: 812, calories_per_100g: 250 }

  it('rounds down to the largest whole-gram serving under the remaining calories', () => {
    const grams = maxRecipeGramsWithinDailyCalories(recipe, 245)

    expect(grams).toBe(98)
    expect((grams as number) * recipe.calories_per_100g / 100).toBeLessThanOrEqual(245)
    expect(((grams as number) + 1) * recipe.calories_per_100g / 100).toBeGreaterThan(245)
  })

  it('caps the suggestion at the whole cooked recipe', () => {
    expect(maxRecipeGramsWithinDailyCalories(recipe, 3000)).toBe(812)
  })

  it('handles zero-calorie recipes and rejects invalid inputs', () => {
    expect(maxRecipeGramsWithinDailyCalories({ total_weight_grams: 812, calories_per_100g: 0 }, 0)).toBe(812)
    expect(maxRecipeGramsWithinDailyCalories({ total_weight_grams: 0, calories_per_100g: 250 }, 245)).toBeNull()
    expect(maxRecipeGramsWithinDailyCalories(recipe, Number.NaN)).toBeNull()
    expect(maxRecipeGramsWithinDailyCalories(recipe, -1)).toBeNull()
    expect(maxRecipeGramsWithinDailyCalories({ ...recipe, calories_per_100g: -1 }, 245)).toBeNull()
  })
})

describe('suggestedMeal', () => {
  it('picks the meal that is most likely in progress', () => {
    expect(suggestedMeal(7)).toBe('breakfast')
    expect(suggestedMeal(12)).toBe('lunch')
    expect(suggestedMeal(19)).toBe('dinner')
    expect(suggestedMeal(22)).toBe('snacks')
  })
})
