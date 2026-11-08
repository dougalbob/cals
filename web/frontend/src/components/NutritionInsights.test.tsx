// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DailyNutrition, DiaryResponse, WeeklyAnalysis } from '../api/types'
import { NutritionInsights } from './NutritionInsights'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

function renderInsights(analysis: WeeklyAnalysis) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NutritionInsights analysis={analysis} />
    </QueryClientProvider>,
  )
}

describe('NutritionInsights prototype panels', () => {
  it('renders both panels, preserves no-data dates, and compares against the saved goals', () => {
    renderInsights(report([
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
    ]))

    expect(screen.getByTestId('nutrition-macro-pattern')).toBeTruthy()
    expect(screen.getByTestId('nutrition-density')).toBeTruthy()
    expect(screen.getByTestId('nutrition-pattern-coverage').textContent).toContain('1 of 2 days')
    expect(screen.getByRole('img', { name: /1 Oct: protein 25.0%, carbs 50.0%, fat 25.0%/ })).toBeTruthy()
    expect(screen.getByText('No food macro data')).toBeTruthy()
    expect(screen.getByTestId('nutrition-target-days-carbs').textContent).toContain('1 / 1')
    expect(screen.getByTestId('nutrition-density-fibre').textContent).toContain('35.0 g/day')
    expect(screen.getByTestId('nutrition-density-fibre').textContent).toContain('30 g/day reference')
    expect(screen.getByTestId('nutrition-density-fibre').textContent).toContain('35.0 g / 1,000 food kcal')
  })

  it('shows only the selected saved-goal rail beneath every day, including dates without macro data', () => {
    const analysis = report([
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
    ])
    analysis.settings = { ...analysis.settings, carb_min_percent: 40, carb_max_percent: 55, fat_max_percent: 28 }
    renderInsights(analysis)

    fireEvent.click(screen.getByTestId('nutrition-focus-chip-carbs'))
    expect(screen.getByTestId('nutrition-focus-note').textContent).toContain('40–55%')
    expect(screen.getByTestId('nutrition-focus-note').textContent).toContain('general reference ranges are not mixed in')
    const carbRails = screen.getAllByTestId('nutrition-focus-rail-carbs')
    expect(carbRails).toHaveLength(2)
    expect(carbRails[1].querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('has no food macro data')
    expect(screen.queryByTestId('nutrition-focus-rail-fat')).toBeNull()

    fireEvent.click(screen.getByTestId('nutrition-focus-chip-fat'))
    expect(screen.getAllByTestId('nutrition-focus-rail-fat')).toHaveLength(2)
    expect(screen.queryByTestId('nutrition-focus-rail-carbs')).toBeNull()

    fireEvent.click(screen.getByTestId('nutrition-focus-chip-fat'))
    expect(screen.queryByTestId('nutrition-focus-rail-fat')).toBeNull()
  })

  it('opens a date to show its saved food and recipe nutrition snapshots in diary order', async () => {
    const date = '2026-10-01'
    const diary: DiaryResponse = {
      date,
      entries: [
        {
          id: 1,
          user_id: 1,
          date,
          meal: 'lunch',
          food_id: 1,
          quantity_grams: 80,
          calories: 190,
          protein: 7,
          carbs: 26,
          fat: 6,
          fibre: 0,
          created_at: `${date}T12:00:00Z`,
          updated_at: `${date}T12:00:00Z`,
          food_name: 'Breaded cod',
        },
        {
          id: 2,
          user_id: 1,
          date,
          meal: 'dinner',
          recipe_id: 2,
          quantity_grams: 200,
          calories: 287.1,
          protein: 18.2,
          carbs: 24.4,
          fat: 10.3,
          fibre: 2.1,
          created_at: `${date}T18:00:00Z`,
          updated_at: `${date}T18:00:00Z`,
          recipe_name: 'Beefy cheese pasta',
        },
      ],
      totals: { calories: 477.1, protein: 25.2, carbs: 50.4, fat: 16.3, fibre: 2.1 },
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(diary), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderInsights(report([daily(date)]))
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Show food details for 1 Oct' }))

    expect(await screen.findByText('Breaded cod')).toBeTruthy()
    const details = screen.getByTestId('nutrition-day-details')
    expect(details.textContent).toContain('Breaded cod')
    expect(details.textContent).toContain('80 g')
    expect(details.textContent).toContain('190 kcal · P 7.0 g · C 26.0 g · F 6.0 g · Fibre 0.0 g')
    expect(details.textContent).toContain('Beefy cheese pasta')
    expect(details.textContent).toContain('Recipe · 200 g')
    expect(details.textContent!.indexOf('Breaded cod')).toBeLessThan(details.textContent!.indexOf('Beefy cheese pasta'))
    expect(fetchMock).toHaveBeenCalledWith('/api/diary?date=2026-10-01', expect.anything())
  })

  it('keeps the 30 g/day fibre reference distinct when the saved goal is different', () => {
    const analysis = report([daily('2026-10-01')])
    analysis.settings = { ...analysis.settings, fibre_goal: 25 }
    renderInsights(analysis)

    const fibreCard = screen.getByTestId('nutrition-density-fibre').textContent ?? ''
    expect(fibreCard).toContain('140% of your 25 g goal · 30 g/day reference')
    expect(screen.getByTestId('nutrition-density').textContent).toContain(
      'not a replacement for the 30 g/day reference (or your saved daily goal)',
    )
  })

  it('keeps undefined density visible as a dash rather than inventing a zero', () => {
    renderInsights(report([
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
    ], 0))

    expect(screen.getByTestId('nutrition-density-fibre').textContent).toContain('— g / 1,000 food kcal')
    expect(screen.getByTestId('nutrition-density-protein').textContent).toContain('— g / 1,000 food kcal')
    expect(screen.getByTestId('nutrition-pattern-coverage').textContent).toContain('0 of 1 days')
    expect(screen.getByTestId('nutrition-focus-chip-protein').hasAttribute('disabled')).toBe(true)
  })
})
