import { describe, expect, it } from 'vitest'
import type { DailyNutrition, WeeklyAnalysis } from '../api/types'
import { macroShares, summariseNutritionInsights } from './nutritionInsights'

function day(date: string, overrides: Partial<DailyNutrition> = {}): DailyNutrition {
  return {
    date,
    calories: 1000,
    food_calories: 1000,
    drink_calories: 0,
    protein: 50,
    carbs: 100,
    fat: 22.2,
    fibre: 35,
    protein_percent: 25,
    carbs_percent: 50,
    fat_percent: 25,
    protein_per_kg: 1,
    ...overrides,
  }
}

function analysis(daily: DailyNutrition[], currentWeightKg = 50): WeeklyAnalysis {
  return {
    start_date: daily[0]?.date ?? '2026-10-01',
    end_date: daily.at(-1)?.date ?? '2026-10-01',
    daily_data: daily,
    averages: {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      protein_percent: 0,
      carbs_percent: 0,
      fat_percent: 0,
      protein_per_kg: 0,
    },
    status: { protein: 'green', carbs: 'green', fat: 'green', fibre: 'green' },
    current_weight_kg: currentWeightKg,
    settings: {
      protein_goal_per_kg: 0.8,
      fibre_goal: 30,
      fat_max_percent: 35,
      carb_min_percent: 45,
      carb_max_percent: 65,
    },
    days_with_data: daily.filter((entry) => entry.calories > 0).length,
  }
}

describe('nutrition insight maths (exploratory panels)', () => {
  it('normalizes slightly rounded macro percentages to one complete bar', () => {
    const shares = macroShares(day('2026-10-01', {
      protein_percent: 25,
      carbs_percent: 50,
      fat_percent: 24.9,
    }))

    expect(shares).not.toBeNull()
    expect(shares!.protein + shares!.carbs + shares!.fat).toBeCloseTo(100)
    expect(shares!.fat).toBeCloseTo(24.9249, 3)
  })

  it('calculates weighted food-only densities and goal-day counts, excluding drink-only days', () => {
    const result = summariseNutritionInsights(analysis([
      day('2026-10-01', { food_calories: 1000, calories: 1000, fibre: 35, protein_per_kg: 1 }),
      day('2026-10-02', {
        food_calories: 500,
        calories: 500,
        protein: 30,
        carbs: 40,
        fat: 13.3,
        fibre: 10,
        protein_percent: 30,
        carbs_percent: 40,
        fat_percent: 30,
        protein_per_kg: 0.6,
      }),
      day('2026-10-03', {
        calories: 160,
        food_calories: 0,
        drink_calories: 160,
        protein: 0,
        carbs: 0,
        fat: 0,
        fibre: 0,
        protein_percent: 0,
        carbs_percent: 0,
        fat_percent: 0,
        protein_per_kg: 0,
      }),
    ]))

    expect(result.foodDays).toBe(2)
    expect(result.macroDays).toBe(2)
    expect(result.proteinDensityPer1000FoodKcal).toBeCloseTo(53.333, 2)
    expect(result.fibreDensityPer1000FoodKcal).toBe(30)
    expect(result.averageFibreGramsPerDay).toBe(22.5)
    expect(result.averageProteinPerKg).toBe(0.8)
    expect(result.targetDays).toEqual({
      protein: { met: 1, days: 2 },
      carbs: { met: 1, days: 2 },
      fat: { met: 2, days: 2 },
      fibre: { met: 1, days: 2 },
    })
  })

  it('returns unavailable densities when there are no food calories or no body weight', () => {
    const result = summariseNutritionInsights(analysis([
      day('2026-10-01', {
        calories: 140,
        food_calories: 0,
        drink_calories: 140,
        protein: 0,
        carbs: 0,
        fat: 0,
        fibre: 0,
        protein_percent: 0,
        carbs_percent: 0,
        fat_percent: 0,
        protein_per_kg: 0,
      }),
    ], 0))

    expect(result.proteinDensityPer1000FoodKcal).toBeNull()
    expect(result.fibreDensityPer1000FoodKcal).toBeNull()
    expect(result.averageProteinPerKg).toBeNull()
    expect(result.targetDays.protein).toBeNull()
    expect(result.targetDays.fibre).toEqual({ met: 0, days: 0 })
  })
})
