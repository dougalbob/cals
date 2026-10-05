/**
 * Weekly report maths (Phase 14.6). These are the numbers decision 46's report
 * card shows — and the ones decision 42 says must never be quietly unexplained,
 * so the unlogged-day labelling is covered as closely as the arithmetic.
 */
import { describe, expect, it } from 'vitest'
import type { CalendarDay, WeightEntry } from '../api/types'
import {
  currentWeekRange,
  readReportRange,
  reportParams,
  summariseReport,
  weightChangeOverRange,
} from './report'

const TODAY = '2026-10-07' // Wednesday

function day(date: string, overrides: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date,
    food_calories: 0,
    drink_calories: 0,
    calories: 0,
    goal: 2000,
    hydration_ml: 0,
    hydration_target_ml: 2000,
    bank_balance: 0,
    meals: {},
    is_today: date === TODAY,
    has_data: false,
    ...overrides,
  }
}

function logged(date: string, calories: number, hydrationMl = 0, bankBalance = 0): CalendarDay {
  return day(date, { calories, food_calories: calories, hydration_ml: hydrationMl, bank_balance: bankBalance, has_data: true })
}

function weight(date: string, kg: number): WeightEntry {
  return { id: 0, user_id: 1, date, weight_kg: kg, created_at: `${date}T07:00:00Z` }
}

describe('report range', () => {
  it('defaults to the current week so far', () => {
    const range = readReportRange(new URLSearchParams(), TODAY)
    expect(range).toEqual({ mode: 'week', from: '2026-10-05', to: '2026-10-07' })
  })

  it('opens on a single day when today is the week it starts', () => {
    expect(currentWeekRange('2026-10-05')).toEqual({ mode: 'week', from: '2026-10-05', to: '2026-10-05' })
  })

  it('normalises a week anchor to that Monday and clamps it to today', () => {
    expect(readReportRange(new URLSearchParams({ report: 'week', report_anchor: '2026-09-30' }), TODAY)).toEqual({
      mode: 'week',
      from: '2026-09-28',
      to: '2026-10-04',
    })
    // A hand-typed future anchor lands on the current week, exactly as the
    // Calendar clamps (decision 63).
    expect(readReportRange(new URLSearchParams({ report: 'week', report_anchor: '2027-01-01' }), TODAY)).toEqual({
      mode: 'week',
      from: '2026-10-05',
      to: '2026-10-07',
    })
  })

  it('reads a custom range, clamps a future end and falls back on nonsense', () => {
    expect(
      readReportRange(new URLSearchParams({ report: 'custom', report_from: '2026-09-01', report_to: '2026-09-20' }), TODAY),
    ).toEqual({ mode: 'custom', from: '2026-09-01', to: '2026-09-20' })

    expect(
      readReportRange(new URLSearchParams({ report: 'custom', report_from: '2026-09-28', report_to: '2026-12-01' }), TODAY),
    ).toEqual({ mode: 'custom', from: '2026-09-28', to: TODAY })

    const nonsense: Record<string, string>[] = [
      { report: 'custom', report_from: '2026-09-20', report_to: '2026-09-01' },
      { report: 'custom', report_from: 'yesterday', report_to: TODAY },
      { report: 'custom', report_to: TODAY },
      { report: 'week', report_anchor: 'not-a-date' },
    ]
    for (const params of nonsense) {
      expect(readReportRange(new URLSearchParams(params), TODAY)).toEqual({
        mode: 'week',
        from: '2026-10-05',
        to: '2026-10-07',
      })
    }
  })

  it('caps a custom range at the API bound rather than asking for the impossible', () => {
    const range = readReportRange(
      new URLSearchParams({ report: 'custom', report_from: '2024-01-01', report_to: TODAY }),
      TODAY,
    )
    expect(range.mode).toBe('custom')
    expect(range.to).toBe(TODAY)
    expect(range.from).toBe('2025-09-03') // 400 days inclusive
  })

  it('writes URL params only when the range is not the default current week', () => {
    expect(reportParams(currentWeekRange(TODAY), TODAY)).toBeNull()
    expect(reportParams({ mode: 'week', from: '2026-09-28', to: '2026-10-04' }, TODAY)).toEqual({
      report: 'week',
      report_anchor: '2026-09-28',
    })
    expect(reportParams({ mode: 'custom', from: '2026-09-01', to: '2026-09-20' }, TODAY)).toEqual({
      report: 'custom',
      report_from: '2026-09-01',
      report_to: '2026-09-20',
    })
  })
})

describe('summariseReport', () => {
  const week = ['2026-10-05', '2026-10-06', '2026-10-07']

  it('partitions logged and unlogged days and never divides by the unlogged ones', () => {
    const days = [
      day('2026-10-04', { bank_balance: 100 }),
      logged('2026-10-05', 2500, 2000, 400),
      day('2026-10-06'),
      logged('2026-10-07', 1500, 500, 900),
    ]
    const summary = summariseReport({ days, from: week[0], to: week[2], weights: [] })

    expect(summary.rangeDays).toBe(3)
    expect(summary.loggedDays.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-07'])
    expect(summary.excludedDays.map((d) => d.date)).toEqual(['2026-10-06'])
    expect(summary.totalCalories).toBe(4000)
    expect(summary.averageCalories).toBe(2000)
    // The budget counts logged days only (decision 42): 2 × 2000, not 3 × 2000.
    expect(summary.loggedDaysBudget).toBe(4000)
    expect(summary.surplus).toBe(0)
    expect(summary.daysOver).toBe(1)
    expect(summary.daysUnder).toBe(1)
    expect(summary.daysOnGoal).toBe(0)
  })

  it('picks the closest and furthest days from goal, either side, earliest on a tie', () => {
    const days = [
      logged('2026-10-05', 1900), // −100
      logged('2026-10-06', 2600), // +600
      logged('2026-10-07', 2050), // +50
    ]
    const summary = summariseReport({ days, from: week[0], to: week[2], weights: [] })

    expect(summary.bestDay?.date).toBe('2026-10-07')
    expect(summary.bestDay?.delta).toBe(50)
    expect(summary.worstDay?.date).toBe('2026-10-06')
    expect(summary.worstDay?.delta).toBe(600)

    // A tie on |delta| keeps the earlier day, so the card is stable.
    const tied = summariseReport({
      days: [logged('2026-10-05', 1900), logged('2026-10-06', 2100)],
      from: '2026-10-05',
      to: '2026-10-06',
      weights: [],
    })
    expect(tied.bestDay?.date).toBe('2026-10-05')
    expect(tied.worstDay?.date).toBe('2026-10-05')
  })

  it('measures bank movement from the day before the range to its last day', () => {
    const days = [
      day('2026-10-04', { bank_balance: -120 }),
      logged('2026-10-05', 2000, 0, -100),
      logged('2026-10-06', 2000, 0, 0),
      logged('2026-10-07', 2000, 0, 200),
    ]
    const summary = summariseReport({ days, from: week[0], to: week[2], weights: [] })
    expect(summary.bank).toEqual({ opening: -120, closing: 200, movement: 320 })

    // No opening day in the payload means no movement claim at all.
    const withoutOpening = summariseReport({ days: days.slice(1), from: week[0], to: week[2], weights: [] })
    expect(withoutOpening.bank).toBeNull()
  })

  it('totals hydration and counts the logged days that met the target', () => {
    const days = [
      logged('2026-10-05', 2000, 2000),
      logged('2026-10-06', 2000, 1500),
      day('2026-10-07'),
    ]
    const summary = summariseReport({ days, from: week[0], to: week[2], weights: [] })
    expect(summary.hydration).toEqual({
      totalMl: 3500,
      targetMl: 2000,
      daysMetTarget: 1,
      daysWithWater: 2,
    })
  })

  it('reports no best or worst day when nothing was logged', () => {
    const summary = summariseReport({ days: [day('2026-10-05'), day('2026-10-06')], from: '2026-10-05', to: '2026-10-06', weights: [] })
    expect(summary.bestDay).toBeNull()
    expect(summary.worstDay).toBeNull()
    expect(summary.averageCalories).toBe(0)
    expect(summary.excludedDays).toHaveLength(2)
  })
})

describe('weightChangeOverRange', () => {
  it('measures between the last weigh-in before the period and the last one inside it', () => {
    const change = weightChangeOverRange(
      [weight('2026-09-28', 84.4), weight('2026-10-03', 84.0), weight('2026-10-09', 83.6)],
      '2026-10-05',
      '2026-10-11',
    )
    expect(change?.startKg).toBe(84.0)
    expect(change?.startDate).toBe('2026-10-03')
    expect(change?.endKg).toBe(83.6)
    expect(change?.endDate).toBe('2026-10-09')
    expect(change?.changeKg).toBeCloseTo(-0.4, 6)
  })

  it('falls back to the first weigh-in inside the period and refuses to invent a change', () => {
    const change = weightChangeOverRange(
      [weight('2026-10-06', 84.3), weight('2026-10-10', 84.1)],
      '2026-10-05',
      '2026-10-11',
    )
    expect(change?.startDate).toBe('2026-10-06')
    expect(change?.endDate).toBe('2026-10-10')
    expect(change?.changeKg).toBeCloseTo(-0.2, 6)

    // One reading is not a change.
    expect(weightChangeOverRange([weight('2026-10-06', 84.3)], '2026-10-05', '2026-10-11')).toBeNull()
    // A reading only before the period is not a change either.
    expect(weightChangeOverRange([weight('2026-10-01', 84.3)], '2026-10-05', '2026-10-11')).toBeNull()
    expect(weightChangeOverRange([], '2026-10-05', '2026-10-11')).toBeNull()
  })
})
