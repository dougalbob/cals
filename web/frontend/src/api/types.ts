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
  food_id: number
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
  servings?: FoodServing[]
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

export interface Drink {
  id: number
  user_id: number
  name: string
  icon: string
  volume_ml: number
  calories: number
  /** This drink contributes to the daily water target (one source of truth). */
  counts_toward_water: boolean
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

export interface VersionResponse {
  version: string
  dev_identity_switch?: boolean
}
