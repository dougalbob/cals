// @vitest-environment jsdom
/**
 * Phase 14.6: the weekly report card (decision 46) and its picker
 * (decisions 107–109).
 *
 * The calendar endpoint is stubbed with a deterministic week so the assertions
 * do not depend on which weekday the suite happens to run, and so the unlogged
 * Sunday gives decision 42's excluded-day labelling something to name.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { WeeklyReport } from './WeeklyReport'
import { currentWeekRange } from '../lib/report'
import { addDays, formatWeekRangeLabel, todayIso, weekRange } from '../lib/calendar'
import { formatShortDate } from '../lib/format'
import type { CalendarDay, DailyNutrition, WeightEntry, WeeklyAnalysis } from '../api/types'

const TODAY = todayIso()

/** Mon 1600 → Sat 2500 kcal, Sundays unlogged; balances rise 10/day. */
function synthDay(date: string): CalendarDay {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay()
  const mondayFirst = (dow + 6) % 7
  const logged = dow !== 0 // Sunday
  const calories = 1600 + mondayFirst * 180
  const epochDay = Math.round(Date.parse(`${date}T12:00:00Z`) / 86_400_000)
  return {
    date,
    food_calories: logged ? calories - 100 : 0,
    drink_calories: logged ? 100 : 0,
    calories: logged ? calories : 0,
    goal: 2000,
    hydration_ml: logged ? (dow === 3 ? 2500 : 1000) : 0,
    hydration_target_ml: 2000,
    bank_balance: epochDay * 10,
    meals: {},
    is_today: date === TODAY,
    has_data: logged,
  }
}

function daysBetween(from: string, to: string): CalendarDay[] {
  const days: CalendarDay[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) days.push(synthDay(date))
  return days
}

function nutritionAnalysis(from: string, to: string): WeeklyAnalysis {
  const daily: DailyNutrition[] = daysBetween(from, to).map((day) => ({
    date: day.date,
    calories: day.calories,
    food_calories: day.food_calories,
    drink_calories: day.drink_calories,
    protein: day.has_data ? 110 : 0,
    carbs: day.has_data ? 220 : 0,
    fat: day.has_data ? 70 : 0,
    fibre: day.has_data ? 25 : 0,
    protein_percent: 25,
    carbs_percent: 50,
    fat_percent: 25,
    protein_per_kg: day.has_data ? 1.4 : 0,
  }))
  const withData = daily.filter((day) => day.calories > 0)
  return {
    start_date: from,
    end_date: to,
    daily_data: daily,
    averages: {
      calories: 2000,
      protein: 110,
      carbs: 220,
      fat: 70,
      fibre: 25,
      protein_percent: 25,
      carbs_percent: 50,
      fat_percent: 25,
      protein_per_kg: 1.4,
    },
    status: { protein: 'amber', carbs: 'green', fat: 'green', fibre: 'red' },
    current_weight_kg: 84.4,
    settings: {
      protein_goal_per_kg: 1.6,
      fibre_goal: 30,
      fat_max_percent: 35,
      carb_min_percent: 45,
      carb_max_percent: 65,
    },
    days_with_data: withData.length,
  }
}

const calls: string[] = []
/** Bodies of POST /api/reminders/weekly-report-seen, one per viewed completed period (decision 121). */
const seenPosts: string[] = []

function renderReport(path = '/metrics') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/metrics" element={<WeeklyReport />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.search}</span>
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  calls.length = 0
  seenPosts.length = 0
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    calls.push(`${url.pathname}${url.search}`)

    if (url.pathname === '/api/reminders/weekly-report-seen') {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { week_to?: string }) : {}
      seenPosts.push(String(body.week_to ?? ''))
      return json({ seen_through: String(body.week_to ?? '') })
    }
    if (url.pathname === '/api/calendar') {
      const from = url.searchParams.get('from') ?? TODAY
      const to = url.searchParams.get('to') ?? TODAY
      return json({ from, to, daily_goal: 2000, bank_start: '2026-01-01', bank_window_days: 14, days: daysBetween(from, to) })
    }
    if (url.pathname === '/api/nutrition/weekly') {
      const from = url.searchParams.get('from') ?? TODAY
      const to = url.searchParams.get('to') ?? TODAY
      return json(nutritionAnalysis(from, to))
    }
    if (url.pathname === '/api/weight') {
      const from = url.searchParams.get('from') ?? TODAY
      const to = url.searchParams.get('to') ?? TODAY
      const entries: WeightEntry[] = [
        { id: 1, user_id: 1, date: addDays(from, 87), weight_kg: 85.0, created_at: '' },
        { id: 2, user_id: 1, date: addDays(to, -1), weight_kg: 84.4, created_at: '' },
      ]
      return json(entries.filter((entry) => entry.date >= from && entry.date <= to))
    }
    return new Response('not found', { status: 404 })
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WeeklyReport — the current week and the picker (decisions 107–109)', () => {
  it('opens on the current week and asks every endpoint for exactly that window', async () => {
    const week = currentWeekRange(TODAY)
    renderReport()

    await screen.findByTestId('report-calories')
    expect(calls).toContain(`/api/nutrition/weekly?from=${week.from}&to=${week.to}`)
    expect(calls).toContain(`/api/calendar?from=${addDays(week.from, -1)}&to=${week.to}`)
    expect(screen.getByTestId('report-range').textContent).toContain('so far')
    // A one-day week (on a Monday) reads "5 Oct", not "5 – 5 Oct".
    const expectedLabel =
      week.from === week.to ? formatShortDate(week.from) : formatWeekRangeLabel(week.from, week.to)
    expect(screen.getByTestId('report-range').textContent).toBe(`${expectedLabel} · so far`)
    // The default view leaves the URL clean — the pannable charts own ?from/to.
    expect(screen.getByTestId('location').textContent).toBe('')
    // The in-progress week is not a completed report, so viewing it must not
    // mark anything seen (decision 121).
    expect(seenPosts).toEqual([])
  })

  it('pages back a week, names the unlogged day and keeps the window in report_* params', async () => {
    const lastWeek = weekRange(addDays(currentWeekRange(TODAY).from, -7))
    renderReport()
    await screen.findByTestId('report-calories')

    fireEvent.click(screen.getByTestId('report-prev'))

    await waitFor(() => {
      expect(calls).toContain(`/api/nutrition/weekly?from=${lastWeek.from}&to=${lastWeek.to}`)
    })
    expect(calls).toContain(`/api/calendar?from=${addDays(lastWeek.from, -1)}&to=${lastWeek.to}`)
    expect(screen.getByTestId('location').textContent).toContain(`report_anchor=${lastWeek.from}`)
    expect(screen.getByTestId('report-range').textContent).toBe(formatWeekRangeLabel(lastWeek.from, lastWeek.to))

    // Six logged days of seven: the unlogged Sunday is named, not hidden
    // (decision 42).
    expect((await screen.findByTestId('report-logged-line')).textContent).toContain('6 of 7 days logged')
    expect(screen.getByTestId('report-excluded').textContent).toContain('Excluded as unlogged')
    expect(screen.getByTestId('report-excluded').textContent).toContain(formatShortDate(lastWeek.to))

    // Best is the Wednesday 1960 (−40) and worst the Saturday 2500 (+500):
    // closest to and furthest from the 2000 goal, either side (decision 109).
    expect(screen.getByTestId('report-best').textContent).toContain('1,960 kcal')
    expect(screen.getByTestId('report-best').textContent).toContain('40 kcal under')
    expect(screen.getByTestId('report-worst').textContent).toContain('2,500 kcal')
    expect(screen.getByTestId('report-worst').textContent).toContain('500 kcal over')

    // The bank movement is measured from the day before the week to its last
    // day (a closing balance is the bank as of the next morning): 7 × 10/day.
    expect(screen.getByTestId('report-bank').textContent).toContain('+70 kcal')

    // Traffic lights come from the range-specific nutrition analysis.
    expect(screen.getByTestId('report-lights').textContent).toContain('Fibre')
    expect(screen.getByTestId('report-lights').textContent).toContain('red')

    // The weight change is carried from the last weigh-in before the week to
    // the last one inside it.
    expect(screen.getByTestId('report-weight').textContent).toContain('-0.6 kg')
    expect(screen.getByTestId('report-weight').textContent).toContain('85.0 → 84.4 kg')

    // Viewing the completed week is what clears the bell's "report ready"
    // advisory — its end date is posted as the seen watermark (decision 121).
    await waitFor(() => {
      expect(seenPosts).toContain(lastWeek.to)
    })

    // Next is live again (the current week is ahead), and it returns to the
    // default URL and window.
    fireEvent.click(screen.getByTestId('report-next'))
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('')
    })
  })

  it('offers a free date range and refuses a backwards one', async () => {
    renderReport()
    await screen.findByTestId('report-calories')

    fireEvent.click(screen.getByTestId('report-mode-custom'))
    // Relative dates, so the suite passes whatever day it runs: 20 days
    // inclusive, ending six days ago.
    const to = addDays(TODAY, -6)
    const from = addDays(to, -19)
    fireEvent.change(screen.getByTestId('report-from'), { target: { value: from } })
    fireEvent.change(screen.getByTestId('report-to'), { target: { value: to } })
    fireEvent.click(screen.getByTestId('report-apply'))

    await waitFor(() => {
      expect(calls).toContain(`/api/nutrition/weekly?from=${from}&to=${to}`)
    })
    expect(screen.getByTestId('location').textContent).toContain(`report_from=${from}`)
    await waitFor(() => {
      expect(screen.getByTestId('report-range').textContent).toContain('20 days')
    })

    const before = calls.length
    fireEvent.change(screen.getByTestId('report-to'), { target: { value: addDays(from, -2) } })
    fireEvent.click(screen.getByTestId('report-apply'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('start date must be on or before')
    expect(calls.length).toBe(before)

    // Switching back to Week returns to the current week and drops the params.
    fireEvent.click(screen.getByTestId('report-mode-week'))
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('')
    })
  })

  it('reads a deep-linked custom range straight out of the URL', async () => {
    const from = addDays(TODAY, -13)
    const to = addDays(TODAY, -7)
    renderReport(`/metrics?report=custom&report_from=${from}&report_to=${to}&from=2026-08-01&to=2026-08-31`)

    await screen.findByTestId('report-calories')
    expect(calls).toContain(`/api/nutrition/weekly?from=${from}&to=${to}`)
    expect(screen.getByTestId('report-range').textContent).toContain('7 days')
    // The charts' own window is untouched.
    expect(screen.getByTestId('location').textContent).toContain('from=2026-08-01')
  })
})
