/**
 * Recipe ordering maths (owner decisions 31 and 32).
 *
 * Fractions are of the **whole cooked recipe**, not of one `serves` share:
 * `serves` stays recipe-level yield information and is never treated as a
 * claim about how much a particular person eats. Every path converts to grams,
 * and a diary row keeps its own nutrition snapshot, exactly like food entries.
 */

import { isValidQuantity, type DiaryQuantityUpdate } from './diary'

export interface WholeRecipeFractionsLike {
  label: string
  fraction: number
}

/** The offered fractions of the whole cooked recipe. */
export const WHOLE_RECIPE_FRACTIONS: WholeRecipeFractionsLike[] = [
  { label: '¼', fraction: 0.25 },
  { label: '½', fraction: 0.5 },
  { label: '¾', fraction: 0.75 },
  { label: 'All', fraction: 1 },
]

/** Grams for a fraction of the whole cooked recipe, or null without a cooked weight. */
export function fractionGrams(totalWeightGrams: number, fraction: number): number | null {
  if (!isValidQuantity(totalWeightGrams) || !Number.isFinite(fraction) || fraction <= 0) return null
  return Math.round(totalWeightGrams * fraction * 10) / 10
}

/** The offered fraction matching a gram value, so the chosen chip can be shown. */
export function matchingFraction(
  totalWeightGrams: number,
  grams: number,
): WholeRecipeFractionsLike | null {
  if (!isValidQuantity(grams)) return null
  for (const option of WHOLE_RECIPE_FRACTIONS) {
    const candidate = fractionGrams(totalWeightGrams, option.fraction)
    if (candidate !== null && Math.abs(candidate - grams) < 0.5) return option
  }
  return null
}

/**
 * The nutrition snapshot for a recipe portion, from the recipe's per-100 g
 * values (which the API derives from the cooked weight).
 */
export function recipeNutritionForGrams(
  recipe: {
    calories_per_100g: number
    protein_per_100g: number
    carbs_per_100g: number
    fat_per_100g: number
    fibre_per_100g: number
  },
  grams: number,
): DiaryQuantityUpdate | null {
  if (!isValidQuantity(grams)) return null

  const factor = grams / 100
  return {
    quantity_grams: grams,
    calories: recipe.calories_per_100g * factor,
    protein: recipe.protein_per_100g * factor,
    carbs: recipe.carbs_per_100g * factor,
    fat: recipe.fat_per_100g * factor,
    fibre: recipe.fibre_per_100g * factor,
  }
}

/**
 * Whether a recipe can be logged at all. Without a cooked weight the API
 * reports zero per-100 g values, and storing that snapshot would silently log
 * a portion with no nutrition.
 */
export function canLogRecipePortion(recipe: { total_weight_grams: number }): boolean {
  return isValidQuantity(recipe.total_weight_grams)
}

/** The meal most likely to be in progress, used as the sheet's initial choice. */
export function suggestedMeal(hour: number): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snacks'
}
