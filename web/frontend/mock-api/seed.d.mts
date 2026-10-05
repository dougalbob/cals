/**
 * Types for the fixture seed data, so TypeScript files that consume it
 * (currently the Diary render test) are checked. Shapes mirror
 * internal/models/models.go.
 */

export interface SeedFoodServing {
  id: number
  food_id: number
  fatsecret_serving_id?: string
  description: string
  grams: number
}

export interface SeedFood {
  id: number
  fatsecret_id?: string
  name: string
  brand?: string
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  fibre_per_100g: number
  serving_name?: string
  serving_grams?: number
  is_edited: boolean
  servings: SeedFoodServing[]
}

export interface SeedRecipe {
  id: number
  name: string
  description: string
  instructions: string
  image_filename: string
  serves: number
  meal_occasions: ('breakfast' | 'lunch' | 'dinner' | 'snack')[]
  dish_type?: 'main' | 'side' | 'soup' | 'salad' | 'dessert'
  key_foods: { food_id: number; food_name: string }[]
  total_time_minutes: number | null
  created_by_user_id: number
  created_by_name: string
  calculated_weight_grams: number
  total_weight_grams: number
  weight_is_manual: boolean
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fibre: number
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  fibre_per_100g: number
  created_at: string
  updated_at: string
  is_archived: boolean
  is_own_creation: boolean
  ingredients: {
    id: number
    recipe_id: number
    food_id: number
    food_name: string
    quantity_grams: number
    calories: number
    sort_order: number
  }[]
  text_ingredients: { id: number; recipe_id: number; description: string; sort_order: number }[]
}

export interface SeedDiaryEntry {
  id: number
  user_id: number
  date: string
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snacks'
  food_id: number | null
  recipe_id: number | null
  quantity_grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
  created_at: string
  updated_at: string
  food_name?: string
  recipe_name?: string
}

export interface SeedDrink {
  id: number
  user_id: number
  name: string
  icon: string
  volume_ml: number
  calories: number
  counts_toward_water: boolean
  accepts_milk?: boolean
  accepts_sugar?: boolean
  usual_milk?: boolean
  usual_sugar?: '0' | '1' | '2' | 'sweetener'
  sort_order?: number
}

export interface SeedDrinkEntry {
  id: number
  user_id: number
  drink_id: number
  date: string
  created_at: string
  name: string
  icon: string
  volume_ml: number
  calories: number
}

export interface SeedWeightEntry {
  id: number
  user_id: number
  date: string
  weight_kg: number
  created_at: string
}

export interface SeedMeasurement {
  id: number
  user_id: number
  date: string
  bust_cm?: number
  chest_cm?: number
  waist_cm?: number
  hips_cm?: number
  upper_arm_cm?: number
  thigh_cm?: number
  neck_cm?: number
  created_at: string
}

export interface SeedNutritionSettings {
  protein_goal_per_kg: number
  fibre_goal: number
  fat_max_percent: number
  carb_min_percent: number
  carb_max_percent: number
}

export interface SeedUser {
  id: number
  email: string
  name: string
  daily_calorie_goal: number
  daily_water_goal_ml: number
  weight_unit: string
  bank_start_date: string
  target_weight_kg?: number
  created_at: string
  updated_at: string
}

export interface SeedTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
}

export const foods: SeedFood[]
export const recipes: SeedRecipe[]
export const favouriteRecipeIds: Set<number>
export const drinks: SeedDrink[]
export const drinkEntries: SeedDrinkEntry[]
export const diaryEntries: SeedDiaryEntry[]
export const weightEntries: SeedWeightEntry[]
export const measurements: SeedMeasurement[]
export const nutritionSettings: SeedNutritionSettings
export const user: SeedUser
export const TODAY: string

export function iso(date: Date): string
export function entriesFor(date: string): SeedDiaryEntry[]
export function totalsFor(date: string): SeedTotals
export function drinkEntriesFor(date: string): SeedDrinkEntry[]
export function caloriesBetween(startDate: string, endDateExclusive: string): number
export function daysBetween(startDate: string, endDate: string): number
export function dateOffset(daysAgo: number): string
export function nextDate(isoDate: string): string
export function drinkCaloriesBetween(startDate: string, endDateExclusive: string): number
export interface SeedWaterSummary {
  date: string
  consumed_ml: number
  target_ml: number
  entries: SeedDrinkEntry[]
}
export function waterFor(date: string): SeedWaterSummary
export function nextDrinkEntryId(): number
export function nextDrinkId(): number
export function findDrink(id: number | string): SeedDrink | undefined
export function nextFoodId(): number
export function nextFoodServingId(): number
export function findFood(id: number | string): SeedFood | undefined
/** A diary entry's food measures, read from the food definition like Go does. */
export function foodMeasuresFor(foodId: number): {
  food_serving_name?: string
  food_serving_grams?: number
  food_servings?: SeedFoodServing[]
}
/** Per-user usual recipe portions (user 1 in the fixture). */
export const recipePortions: Map<number, number>
export function usualGramsFor(recipeId: number): number | null
export function rememberRecipePortion(recipeId: number, grams: number, makeUsual: boolean): void
/** Restores the seeded diary/drinks after a test has mutated them. */
export function resetFixtures(): void
