/**
 * Diary-entry domain helpers — the parts worth unit-testing.
 *
 * Editing the weight of a logged entry **rescales the values that were saved with
 * that entry**. It deliberately does not re-read the food or recipe definition:
 * those can have been edited since the entry was logged, and re-reading them would
 * silently rewrite history. This mirrors the legacy vanilla-JS edit flow, which
 * used the same ratio calculation.
 */

/** The nutrition numbers a diary entry stores when it is logged. */
export interface DiaryNutritionSnapshot {
  quantity_grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
}

/** The payload sent to `PUT /api/diary/{id}` when the weight changes. */
export interface DiaryQuantityUpdate {
  quantity_grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
}

/** Per-100 g nutrition values used to snapshot a newly logged food or recipe. */
export interface NutritionPer100g {
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  fibre_per_100g: number
}

/** A weight must be a real, positive number of grams. */
export function isValidQuantity(grams: number): boolean {
  return Number.isFinite(grams) && grams > 0
}

/** Create a diary nutrition snapshot from a definition's per-100 g values. */
export function nutritionForGrams(
  source: NutritionPer100g,
  grams: number,
): DiaryQuantityUpdate | null {
  if (!isValidQuantity(grams)) return null

  const factor = grams / 100
  return {
    quantity_grams: grams,
    calories: source.calories_per_100g * factor,
    protein: source.protein_per_100g * factor,
    carbs: source.carbs_per_100g * factor,
    fat: source.fat_per_100g * factor,
    fibre: source.fibre_per_100g * factor,
  }
}

/**
 * The entry's own calories per 100 g, derived from its saved snapshot — what the
 * edit sheet shows the user as the basis for the live preview.
 */
export function caloriesPer100g(entry: DiaryNutritionSnapshot): number | null {
  if (!isValidQuantity(entry.quantity_grams)) return null
  return (entry.calories / entry.quantity_grams) * 100
}

/**
 * Scale an entry's saved nutrition to a new weight.
 *
 * Returns `null` when either the new weight or the entry's stored weight is not a
 * valid positive quantity, so callers must handle the refusal rather than sending
 * a zero or negative row. Values are returned unrounded: rounding belongs at the
 * presentation layer, and the database stores full precision.
 */
export function scaleEntryToGrams(
  entry: DiaryNutritionSnapshot,
  newGrams: number,
): DiaryQuantityUpdate | null {
  if (!isValidQuantity(newGrams) || !isValidQuantity(entry.quantity_grams)) return null

  const ratio = newGrams / entry.quantity_grams
  return {
    quantity_grams: newGrams,
    calories: entry.calories * ratio,
    protein: entry.protein * ratio,
    carbs: entry.carbs * ratio,
    fat: entry.fat * ratio,
    fibre: entry.fibre * ratio,
  }
}
