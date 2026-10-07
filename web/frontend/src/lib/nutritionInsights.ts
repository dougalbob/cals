import type { DailyNutrition, WeeklyAnalysis } from '../api/types'

export interface MacroShares {
  protein: number
  carbs: number
  fat: number
}

export interface TargetDayCount {
  met: number
  days: number
}

export interface NutritionInsightSummary {
  /** Days with positive, recorded food energy; a log is not assumed complete. */
  foodDays: number
  /** Food days with a usable protein/carbs/fat energy split. */
  macroDays: number
  proteinDensityPer1000FoodKcal: number | null
  fibreDensityPer1000FoodKcal: number | null
  averageProteinPerKg: number | null
  averageFibreGramsPerDay: number | null
  targetDays: {
    protein: TargetDayCount | null
    carbs: TargetDayCount
    fat: TargetDayCount
    fibre: TargetDayCount
  }
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function hasFoodCalories(day: DailyNutrition): boolean {
  return Number.isFinite(day.food_calories) && day.food_calories > 0
}

/**
 * Return a normalized split of the calories attributed to tracked macros.
 * The API's percentages are based on protein/carbs/fat only; drinks have
 * calories but no macro breakdown, so these values must not be described as a
 * share of every recorded calorie.
 */
export function macroShares(day: DailyNutrition): MacroShares | null {
  const protein = nonNegative(day.protein_percent)
  const carbs = nonNegative(day.carbs_percent)
  const fat = nonNegative(day.fat_percent)
  const total = protein + carbs + fat
  if (total <= 0) return null

  return {
    protein: (protein / total) * 100,
    carbs: (carbs / total) * 100,
    fat: (fat / total) * 100,
  }
}

function countTargetDays(days: DailyNutrition[], meetsTarget: (day: DailyNutrition) => boolean): TargetDayCount {
  return { met: days.filter(meetsTarget).length, days: days.length }
}

/**
 * Summaries for the exploratory Nutrition panels. Densities are ratios of the
 * summed food nutrients to summed food kcal for the selected window (a
 * calorie-weighted density), not an average of per-day densities. Drink energy
 * is deliberately excluded because the drink ledger has no macro breakdown.
 */
export function summariseNutritionInsights(analysis: WeeklyAnalysis): NutritionInsightSummary {
  const foodDays = analysis.daily_data.filter(hasFoodCalories)
  const macroDays = foodDays.filter((day) => macroShares(day) !== null)
  const foodKcal = foodDays.reduce((sum, day) => sum + nonNegative(day.food_calories), 0)
  const proteinGrams = foodDays.reduce((sum, day) => sum + nonNegative(day.protein), 0)
  const fibreGrams = foodDays.reduce((sum, day) => sum + nonNegative(day.fibre), 0)
  const weightAvailable = Number.isFinite(analysis.current_weight_kg) && analysis.current_weight_kg > 0
  const proteinPerKgDays = weightAvailable
    ? macroDays.filter((day) => Number.isFinite(day.protein_per_kg))
    : []

  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

  const proteinTargetDays: TargetDayCount | null = weightAvailable
    ? countTargetDays(proteinPerKgDays, (day) => day.protein_per_kg >= analysis.settings.protein_goal_per_kg)
    : null

  return {
    foodDays: foodDays.length,
    macroDays: macroDays.length,
    proteinDensityPer1000FoodKcal: foodKcal > 0 ? (proteinGrams / foodKcal) * 1000 : null,
    fibreDensityPer1000FoodKcal: foodKcal > 0 ? (fibreGrams / foodKcal) * 1000 : null,
    averageProteinPerKg: average(proteinPerKgDays.map((day) => day.protein_per_kg)),
    averageFibreGramsPerDay: foodDays.length ? fibreGrams / foodDays.length : null,
    targetDays: {
      protein: proteinTargetDays,
      carbs: countTargetDays(macroDays, (day) => {
        const shares = macroShares(day)
        return shares !== null &&
          shares.carbs >= analysis.settings.carb_min_percent &&
          shares.carbs <= analysis.settings.carb_max_percent
      }),
      fat: countTargetDays(macroDays, (day) => {
        const shares = macroShares(day)
        return shares !== null && shares.fat <= analysis.settings.fat_max_percent
      }),
      fibre: countTargetDays(foodDays, (day) => day.fibre >= analysis.settings.fibre_goal),
    },
  }
}
