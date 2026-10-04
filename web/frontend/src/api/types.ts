/**
 * TypeScript mirror of the cals API contract.
 * Source of truth: internal/models/models.go and the JSON structs in
 * internal/handlers/*.go. Keep in step with the Go structs.
 */

export interface User {
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

export interface FoodServing {
  id: number
  food_id?: number
  /** Present on FatSecret-provided measures; user-defined ones have none. */
  fatsecret_serving_id?: string
  description: string
  grams: number
}

export interface Food {
  /** Number for local foods, `fs_<id>` string for FatSecret results. */
  id: number | string
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
  /** Named gram-backed measures: the preferred serving plus any others. */
  servings?: FoodServing[]
}

/** A named measure sent to POST/PUT /api/foods. Grams stay canonical. */
export interface FoodServingInput {
  description: string
  grams: number
}

export interface FoodInput {
  name: string
  brand?: string
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  fibre_per_100g: number
  serving_name?: string
  serving_grams?: number
  /** User-defined measures. FatSecret-provided rows are never sent here. */
  servings?: FoodServingInput[]
}

export const RECIPE_MEAL_OCCASIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
] as const

export type RecipeMealOccasion = (typeof RECIPE_MEAL_OCCASIONS)[number]['value']

export const RECIPE_DISH_TYPES = [
  { value: 'main', label: 'Main' },
  { value: 'side', label: 'Side' },
  { value: 'soup', label: 'Soup' },
  { value: 'salad', label: 'Salad' },
  { value: 'dessert', label: 'Dessert' },
] as const

export type RecipeDishType = (typeof RECIPE_DISH_TYPES)[number]['value']

export interface RecipeKeyFood {
  food_id: number
  food_name: string
}

/** Shared recipe content; favourite state is returned for the signed-in user. */
export interface Recipe {
  id: number
  name: string
  description?: string
  instructions?: string
  image_filename?: string
  serves: number
  created_by_user_id: number
  created_by_name?: string
  calculated_weight_grams: number
  total_weight_grams: number
  /** True when the cooked yield is a user-measured weight rather than ingredient grams. */
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
  updated_at?: string
  is_favourite: boolean
  /** Number of times the signed-in user has logged this recipe. */
  times_logged: number
  /**
   * Household-wide retirement flag (decision 59). An archived recipe is hidden from the
   * catalogue by default, cannot be logged until restored, and keeps its Diary history.
   */
  is_archived: boolean
  /** Shared recipe-origin marker; independent of who created the database row. */
  is_own_creation: boolean
  /** The signed-in user's remembered portion in grams; null until they log it. */
  usual_grams: number | null
  meal_occasions: RecipeMealOccasion[]
  dish_type?: RecipeDishType
  key_foods: RecipeKeyFood[]
  total_time_minutes: number | null
}

export interface RecipeIngredient {
  id: number
  recipe_id: number
  food_id: number
  food_name: string
  quantity_grams: number
  calories?: number
  sort_order: number
}

export interface RecipeTextIngredient {
  id: number
  recipe_id: number
  description: string
  sort_order: number
}

export interface RecipeDetail extends Recipe {
  ingredients?: RecipeIngredient[]
  text_ingredients?: RecipeTextIngredient[]
}

export interface RecipeMetadataInput {
  meal_occasions: RecipeMealOccasion[]
  dish_type: RecipeDishType | ''
  key_food_ids: number[]
  /** Shared recipe-origin marker; optional so older metadata clients can omit it without clearing it. */
  is_own_creation?: boolean
  total_time_minutes: number | null
}

export interface RecipeIngredientInput {
  food_id: number
  quantity_grams: number
  sort_order: number
}

export interface RecipeTextIngredientInput {
  description: string
  sort_order: number
}

/** Full content update for PUT /api/recipes/{id}; names are fixed at creation. */
export interface RecipeContentInput {
  name: string
  description: string
  instructions: string
  serves: number
  total_weight_grams: number
  weight_is_manual: boolean
  ingredients: RecipeIngredientInput[]
  text_ingredients: RecipeTextIngredientInput[]
}

/** Full recipe definition plus its shared classification, accepted by POST /api/recipes. */
export interface RecipeCreateInput extends RecipeContentInput {
  meal_occasions: RecipeMealOccasion[]
  dish_type: RecipeDishType | ''
  key_food_ids: number[]
  is_own_creation: boolean
  total_time_minutes: number | null
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

export const MEALS: { id: Meal; label: string; icon: string }[] = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '☀️' },
  { id: 'dinner', label: 'Dinner', icon: '🌙' },
  { id: 'snacks', label: 'Snacks', icon: '🍿' },
]

export interface DiaryEntry {
  id: number
  user_id: number
  date: string
  meal: Meal
  food_id?: number | null
  recipe_id?: number | null
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
  /**
   * The logged food's current measures, so Edit can offer the same choices as
   * Add. Read from the food definition; the entry itself still stores only
   * grams and its own nutrition snapshot.
   */
  food_serving_name?: string
  food_serving_grams?: number
  food_servings?: FoodServing[]
}

export interface DailyTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
}

export interface DiaryResponse {
  date: string
  entries: DiaryEntry[]
  totals: DailyTotals
}

export interface BankResponse {
  daily_goal: number
  bank_balance: number
  today_available: number
  start_date: string
  as_of_date: string
}

export interface WeightEntry {
  id: number
  user_id: number
  date: string
  weight_kg: number
  created_at: string
}

export interface MeasurementEntry {
  date: string
  bust_cm: number | null
  chest_cm: number | null
  waist_cm: number | null
  hips_cm: number | null
  upper_arm_cm: number | null
  thigh_cm: number | null
  neck_cm: number | null
}

export interface DailyCalories {
  date: string
  calories: number
  goal: number
}

export interface DailyBank {
  date: string
  balance: number
}

export type SugarAmount = '0' | '1' | '2' | 'sweetener'

export interface Drink {
  id: number
  user_id: number
  name: string
  icon: string
  volume_ml: number
  calories: number
  /** This drink contributes to the daily water target (one source of truth). */
  counts_toward_water: boolean
  /** Shown on the vary-this-time sheet. Absent on older rows — infer from the catalog. */
  accepts_milk?: boolean
  accepts_sugar?: boolean
  usual_milk?: boolean
  usual_sugar?: SugarAmount
  /** Lower numbers appear first on the Today 2×2. */
  sort_order?: number
}

export interface DrinkInput {
  name: string
  icon: string
  volume_ml: number
  calories: number
  counts_toward_water: boolean
  accepts_milk?: boolean
  accepts_sugar?: boolean
  usual_milk?: boolean
  usual_sugar?: SugarAmount
  sort_order?: number
}

/** Daily water summary — derived from water-counting drink entries. */
export interface WaterResponse {
  date: string
  consumed_ml: number
  target_ml: number
  entries: DrinkEntry[]
}

export interface DrinkEntry {
  id: number
  drink_id: number
  date: string
  name: string
  icon: string
  volume_ml: number
  calories: number
}

export interface NutritionSettings {
  protein_goal_per_kg: number
  fibre_goal: number
  fat_max_percent: number
  carb_min_percent: number
  carb_max_percent: number
}

export type TrafficLight = 'green' | 'amber' | 'red'

export interface MacroStatus {
  protein: TrafficLight
  carbs: TrafficLight
  fat: TrafficLight
  fibre: TrafficLight
}

export interface DailyNutrition {
  date: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
  protein_percent: number
  carbs_percent: number
  fat_percent: number
  protein_per_kg: number
}

export interface MacroAverages {
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
  protein_percent: number
  carbs_percent: number
  fat_percent: number
  protein_per_kg: number
}

export interface WeeklyAnalysis {
  start_date: string
  end_date: string
  daily_data: DailyNutrition[]
  averages: MacroAverages
  status: MacroStatus
  current_weight_kg: number
  settings: NutritionSettings
  days_with_data: number
}

/**
 * Per-day summary returned by GET /api/calendar?from=&to= (decision 49).
 *
 * Additive endpoint — no existing response shape is changed. Each day carries
 * total calories (food + drink), food calories broken down by meal, a hydration
 * total in ml (drinks flagged counts_toward_water), and the end-of-day bank
 * balance, so the month/week views can render a rich cell without N extra
 * requests.
 */
export interface CalendarDay {
  date: string
  food_calories: number
  drink_calories: number
  calories: number
  goal: number
  hydration_ml: number
  hydration_target_ml: number
  bank_balance: number
  meals: Partial<Record<Meal, number>>
  is_today: boolean
  has_data: boolean
}

export interface CalendarResponse {
  from: string
  to: string
  daily_goal: number
  bank_start: string
  days: CalendarDay[]
}

export interface VersionResponse {
  version: string
  dev_identity_switch?: boolean
}
