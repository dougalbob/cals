// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { DailyNutrition, WeeklyAnalysis } from '../api/types'
import { NutritionInsights } from './NutritionInsights'

afterEach(cleanup)

function daily(date: string, overrides: Partial<DailyNutrition> = {}): DailyNutrition {
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

function report(dailyData: DailyNutrition[], currentWeightKg = 50): WeeklyAnalysis {
  return {
    start_date: dailyData[0]?.date ?? '2026-10-01',
    end_date: dailyData.at(-1)?.date ?? '2026-10-01',
    daily_data: dailyData,
    averages: {
      calories: 1000,
      protein: 50,
      carbs: 100,
      fat: 22.2,
      fibre: 35,
      protein_percent: 25,
      carbs_percent: 50,
      fat_percent: 25,
      protein_per_kg: 1,
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
    days_with_data: dailyData.filter((entry) => entry.calories > 0).length,
  }
}

describe('NutritionInsights prototype panels', () => {
  it('renders the new macro and density panels alongside their clear labels', () => {
    render(
      <NutritionInsights
        analysis={report([
          daily('2026-10-01'),
          daily('2026-10-02', {
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
        ])}
      />,
    )

    expect(screen.getByTestId('nutrition-macro-pattern')).toBeTruthy()
    expect(screen.getByTestId('nutrition-density')).toBeTruthy()
    expect(screen.getByTestId('nutrition-pattern-coverage').textContent).toContain('1 of 2 days')
    expect(screen.getByRole('img', { name: /1 Oct: protein 25.0%, carbs 50.0%, fat 25.0%/ })).toBeTruthy()
    expect(screen.getByText('No food macro data')).toBeTruthy()
    expect(screen.getByTestId('nutrition-target-days-carbs').textContent).toContain('1 / 1')
    expect(screen.getByTestId('nutrition-density-fibre').textContent).toContain('35.0 g / 1,000 kcal')
  })

  it('keeps undefined density visible as a dash rather than inventing a zero', () => {
    render(
      <NutritionInsights
        analysis={report([
          daily('2026-10-01', {
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
        ])}
      />,
    )

    expect(screen.getByTestId('nutrition-density-fibre').textContent).toContain('— g / 1,000 kcal')
    expect(screen.getByTestId('nutrition-density-protein').textContent).toContain('— g / 1,000 kcal')
    expect(screen.getByTestId('nutrition-pattern-coverage').textContent).toContain('0 of 1 days')
  })
})
