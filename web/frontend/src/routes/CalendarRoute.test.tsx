// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { CalendarRoute } from './CalendarRoute'
import { addDays, formatMonthLabel, monthForIso, todayIso, weekRange } from '../lib/calendar'
import type { CalendarDay } from '../api/types'

/** Records where the router ended up, so navigation can be asserted without a full app. */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname}</span>
}

function renderCalendar(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/calendar" element={<CalendarRoute />} />
          <Route path="/calendar/:view/:anchor" element={<CalendarRoute />} />
          <Route path="/diary/:date" element={<p>diary for date</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * The calendar endpoint, replaced with a fixed set of days. Bar geometry and
 * the future-day rules are about the numbers a day carries, so pinning them
 * here keeps the tests honest without depending on which day of the month the
 * fixture happens to be generated for.
 */
function stubbedFetch(days: CalendarDay[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/calendar') {
      return new Response(JSON.stringify({ from: url.searchParams.get('from'), to: url.searchParams.get('to'), days }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const result = handle(init?.method ?? 'GET', url, undefined)
    if (!result) return new Response('not found', { status: 404 })
    const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    return new Response(result.status === 204 ? null : body, {
      status: result.status,
      headers: { 'Content-Type': result.contentType ?? 'application/json' },
    })
  }
}

function dayOf(overrides: Partial<CalendarDay> & { date: string }): CalendarDay {
  return {
    food_calories: 0,
    drink_calories: 0,
    calories: 0,
    goal: 2000,
    hydration_ml: 0,
    hydration_target_ml: 2000,
    bank_balance: 0,
    meals: {},
    is_today: false,
    has_data: true,
    ...overrides,
  }
}

const location = () => screen.getByTestId('location').textContent ?? ''

beforeEach(() => {
  seed.resetFixtures()
  vi.stubGlobal('fetch', stubbedFetch([]))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CalendarRoute', () => {
  it('defaults to month view for the current month and shows today', async () => {
    const today = todayIso()
    vi.stubGlobal('fetch', stubbedFetch([dayOf({ date: today, calories: 1500, is_today: true })]))
    renderCalendar('/calendar')
    // Month grid renders 42 cells once the data lands; wait for weekday headers.
    expect(await screen.findByText('Mon')).toBeTruthy()
    for (const day of ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(day)).toBeTruthy()
    }
    // Every past and present day is a link to its diary.
    const links = screen.getAllByRole('link')
    expect(links.some((link) => link.getAttribute('href') === `/diary/${today}`)).toBe(true)
  })

  it('renders the week view with per-meal calorie breakdowns and hydration', async () => {
    vi.stubGlobal(
      'fetch',
      stubbedFetch(
        Array.from({ length: 7 }, (_, i) => {
          const date = addDays(weekRange(seed.TODAY).from, i)
          return dayOf({ date, calories: 1500, meals: { breakfast: 400, lunch: 500, dinner: 600 } })
        }),
      ),
    )
    renderCalendar(`/calendar/week/${seed.TODAY}`)

    // Week view opens with 7 day cards. Each card renders a Hydration row,
    // and the ones with data show Breakfast/Lunch/Dinner/Snacks labels.
    const hydrations = await screen.findAllByText('Hydration')
    expect(hydrations.length).toBe(7)
    expect(screen.getAllByText(/Breakfast/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Lunch/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Dinner/).length).toBeGreaterThan(0)
  })

  it('pages back a month and forward again with the arrows', async () => {
    // The month before this one, however short a gap that is.
    const lastMonth = monthForIso(addDays(`${monthForIso(todayIso())}-01`, -1))
    renderCalendar(`/calendar/month/${lastMonth}`)
    expect(await screen.findByText('Mon')).toBeTruthy()
    expect(screen.getByRole('heading', { name: formatMonthLabel(lastMonth) })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await waitFor(() =>
      expect(location()).toBe(`/calendar/month/${monthForIso(todayIso())}`),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(location()).toBe(`/calendar/month/${lastMonth}`))
  })

  it('will not go past today: the forward arrow stops at the current month', async () => {
    renderCalendar(`/calendar/month/${monthForIso(todayIso())}`)
    expect(await screen.findByText('Mon')).toBeTruthy()

    const next = screen.getByRole('button', { name: 'Next month' })
    expect(next.hasAttribute('disabled')).toBe(true)
    // Clicking a disabled control changes nothing — not even the URL.
    fireEvent.click(next)
    expect(location()).toBe(`/calendar/month/${monthForIso(todayIso())}`)
    // Backward is still available, and Today stays for the way home.
    expect(screen.getByRole('button', { name: 'Previous month' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy()
  })

  it('pulls a hand-typed future month back to the one containing today', async () => {
    const futureMonth = monthForIso(addDays(todayIso(), 400))
    renderCalendar(`/calendar/month/${futureMonth}`)
    expect(await screen.findByText('Mon')).toBeTruthy()
    expect(screen.getByRole('heading', { name: formatMonthLabel(monthForIso(todayIso())) })).toBeTruthy()
  })

  it('will not go past today: the forward arrow stops at the current week', async () => {
    renderCalendar(`/calendar/week/${todayIso()}`)
    expect(await screen.findAllByText('Hydration')).toHaveLength(7)
    const next = screen.getByRole('button', { name: 'Next week' })
    expect(next.hasAttribute('disabled')).toBe(true)
    fireEvent.click(next)
    expect(location()).toBe(`/calendar/week/${todayIso()}`)
  })

  it('does not offer days that have not happened yet', async () => {
    const today = todayIso()
    const tomorrow = addDays(today, 1)
    vi.stubGlobal('fetch', stubbedFetch([dayOf({ date: today, calories: 1500, is_today: true })]))
    renderCalendar(`/calendar/month/${monthForIso(today)}`)
    expect(await screen.findByText('Mon')).toBeTruthy()

    // Today is a link; the day after it is present but inert, because there is
    // nothing logged to look at and nothing to correct.
    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(links).toContain(`/diary/${today}`)
    expect(links).not.toContain(`/diary/${tomorrow}`)
  })

  it('shows an overspent day as a green bar with a proportional red tail', async () => {
    // 2,400 against a 2,000 goal: a fifth of the bar is overspend, not all of it.
    const overDay = dayOf({ date: '2026-03-05', calories: 2400, goal: 2000 })
    vi.stubGlobal('fetch', stubbedFetch([overDay]))
    renderCalendar('/calendar/month/2026-03')
    const cell = await screen.findByLabelText(/^2026-03-05:/)

    const bar = cell.querySelector('[data-calorie-bar]') as HTMLElement
    expect(bar).toBeTruthy()
    const green = bar.querySelector('[data-segment="within-goal"]') as HTMLElement
    const red = bar.querySelector('[data-segment="overspend"]') as HTMLElement
    expect(green.style.width).toBe('83.3%')
    expect(red.style.width).toBe('16.7%')
  })

  it('keeps an under-goal day a plain green bar', async () => {
    vi.stubGlobal('fetch', stubbedFetch([dayOf({ date: '2026-03-05', calories: 1000, goal: 2000 })]))
    renderCalendar('/calendar/month/2026-03')
    const cell = await screen.findByLabelText(/^2026-03-05:/)

    const bar = cell.querySelector('[data-calorie-bar]') as HTMLElement
    expect((bar.querySelector('[data-segment="within-goal"]') as HTMLElement).style.width).toBe('50%')
    expect(bar.querySelector('[data-segment="overspend"]')).toBeNull()
  })

  it('switches between month and week via the view toggle', async () => {
    renderCalendar('/calendar')
    // Wait for month grid to render before toggling.
    expect(await screen.findByText('Mon')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    // Week view renders 7 Hydration rows (one per day card), whereas month
    // view has none.
    expect(await screen.findAllByText('Hydration')).toHaveLength(7)
    // Toggle back to month.
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    await waitFor(() => expect(screen.queryAllByText('Hydration')).toHaveLength(0))
  })

  it('returns days-with-data from the calendar endpoint with meal + hydration fields', async () => {
    // Directly drive the fixture so we know the shape matches the UI.
    const url = new URL(
      `http://localhost/api/calendar?from=${seed.TODAY}&to=${seed.TODAY}`,
    )
    const response = handle('GET', url, undefined)
    expect(response?.status).toBe(200)
    const body = response?.body as {
      days: Array<{
        meals: Record<string, number>
        hydration_ml: number
        calories: number
      }>
    }
    expect(body.days).toHaveLength(1)
    const day = body.days[0]
    expect(typeof day.meals.breakfast).toBe('number')
    expect(typeof day.hydration_ml).toBe('number')
    expect(day.calories).toBeGreaterThan(0)
  })
})
