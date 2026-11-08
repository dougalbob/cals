/**
 * Recipe nutrition rating guides (issue #97, decision 126).
 *
 * Four independent 1–5 ratings — 5 is excellent, 1 is poor — each
 * comparing a per-100 g density (or grams per kcal for volume)
 * against fixed, published bands. Densities keep recipes comparable
 * regardless of batch size, and the bands are the whole method:
 * there is no hidden weighting. The overall guide is the plain mean
 * of the four scores and is only offered when all four exist.
 *
 * Ratings are advisory. A recipe without a cooked weight or without
 * calorie information cannot be rated, and is withheld rather than
 * scored from zeros — a missing value must never read as "excellent".
 */

export interface RecipeRatingInput {
  total_weight_grams: number
  total_calories: number
  fat_per_100g: number
  carbs_per_100g: number
  fibre_per_100g: number
}

export type RatingKey = 'fat' | 'fibre' | 'carbs' | 'volume'

export interface NutrientRating {
  key: RatingKey
  label: string
  /** The measured value, in `unit`. */
  value: number
  unit: string
  /** 1–5, where 5 is excellent. */
  score: number
  /** Words for the band the value landed in, e.g. "Low fat". */
  band: string
}

export interface RecipeRatings {
  fat: NutrientRating
  fibre: NutrientRating
  carbs: NutrientRating
  volume: NutrientRating
  /** Mean of the four scores, rounded to one decimal for display. */
  overall: number
}

/** Upper bounds of the 5/4/3/2 bands for a lower-is-better density (g/100 g). */
const FAT_BANDS: readonly [number, number, number, number] = [3, 6, 10, 15]
const CARBS_BANDS: readonly [number, number, number, number] = [5, 10, 20, 30]
/** Lower bounds of the 5/4/3/2 bands for a higher-is-better density. */
const FIBRE_BANDS: readonly [number, number, number, number] = [6, 4.5, 3, 1.5]
/** Lower bounds of the 5/4/3/2 bands for volume, in grams per kcal. */
const VOLUME_BANDS: readonly [number, number, number, number] = [2, 1.5, 1, 0.6]

/** Band words, indexed by score minus one (1 → poor … 5 → excellent). */
const FAT_WORDS = ['Very high fat', 'High fat', 'Moderate fat', 'Low fat', 'Very low fat']
const FIBRE_WORDS = ['Low fibre', 'Some fibre', 'Good fibre', 'High fibre', 'Very high fibre']
const CARBS_WORDS = ['Very high carbs', 'High carbs', 'Moderate carbs', 'Low carbs', 'Very low carbs']
const VOLUME_WORDS = ['Energy dense', 'Low volume', 'Moderate volume', 'High volume', 'Very high volume']

function scoreLowerIsBetter(value: number, bounds: readonly [number, number, number, number]): number {
  if (value <= bounds[0]) return 5
  if (value <= bounds[1]) return 4
  if (value <= bounds[2]) return 3
  if (value <= bounds[3]) return 2
  return 1
}

function scoreHigherIsBetter(value: number, bounds: readonly [number, number, number, number]): number {
  if (value >= bounds[0]) return 5
  if (value >= bounds[1]) return 4
  if (value >= bounds[2]) return 3
  if (value >= bounds[3]) return 2
  return 1
}

/** One decimal, matching how the API reports its per-100 g values. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * The four rating guides for a recipe, or null when the recipe
 * cannot be rated at all (no cooked weight or no calorie information).
 */
export function recipeRatings(recipe: RecipeRatingInput): RecipeRatings | null {
  const { total_weight_grams: weight, total_calories: calories } = recipe
  if (!Number.isFinite(weight) || weight <= 0) return null
  if (!Number.isFinite(calories) || calories <= 0) return null

  const densities = [recipe.fat_per_100g, recipe.carbs_per_100g, recipe.fibre_per_100g]
  if (densities.some((value) => !Number.isFinite(value) || value < 0)) return null

  const gramsPerKcal = weight / calories

  const fatScore = scoreLowerIsBetter(recipe.fat_per_100g, FAT_BANDS)
  const fibreScore = scoreHigherIsBetter(recipe.fibre_per_100g, FIBRE_BANDS)
  const carbsScore = scoreLowerIsBetter(recipe.carbs_per_100g, CARBS_BANDS)
  const volumeScore = scoreHigherIsBetter(gramsPerKcal, VOLUME_BANDS)

  const fat: NutrientRating = {
    key: 'fat',
    label: 'Fat',
    value: recipe.fat_per_100g,
    unit: 'g/100 g',
    score: fatScore,
    band: FAT_WORDS[fatScore - 1],
  }
  const fibre: NutrientRating = {
    key: 'fibre',
    label: 'Fibre',
    value: recipe.fibre_per_100g,
    unit: 'g/100 g',
    score: fibreScore,
    band: FIBRE_WORDS[fibreScore - 1],
  }
  const carbs: NutrientRating = {
    key: 'carbs',
    label: 'Carbs',
    value: recipe.carbs_per_100g,
    unit: 'g/100 g',
    score: carbsScore,
    band: CARBS_WORDS[carbsScore - 1],
  }
  const volume: NutrientRating = {
    key: 'volume',
    label: 'Volume',
    value: round1(gramsPerKcal),
    unit: 'g/kcal',
    score: volumeScore,
    band: VOLUME_WORDS[volumeScore - 1],
  }

  const overall = round1((fat.score + fibre.score + carbs.score + volume.score) / 4)

  return { fat, fibre, carbs, volume, overall }
}

/** The four guides in display order, overall aside. */
export function ratingList(ratings: RecipeRatings): NutrientRating[] {
  return [ratings.fat, ratings.fibre, ratings.carbs, ratings.volume]
}
