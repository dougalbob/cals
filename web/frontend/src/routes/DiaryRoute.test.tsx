// @vitest-environment jsdom
/**
 * Render test: mounts the real Diary screen against the fixture API.
 *
 * This is the piece the type checker cannot prove — that the components
 * actually render, that queries resolve, and that the ring/bank/totals compute.
 * It drives the same handler the dev server uses, so the test exercises the
 * same response shapes the Go API returns.
 *
 * Expected values are derived from the fixture rather than hard-coded, so the
 * test does not rot as the seeded data (which is relative to "today") moves on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { DiaryRoute } from './DiaryRoute'
import { addDays, formatNumber, todayIso } from '../lib/format'

function renderDiary(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/diary" element={<DiaryRoute />} />
          <Route path="/diary/:date" element={<DiaryRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    const result = handle(method, url, body)

    if (!result) return new Response('not found', { status: 404 })
    return new Response(typeof result.body === 'string' ? result.body : JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': result.contentType ?? 'application/json' },
    })
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DiaryRoute', () => {
  it('renders the seeded diary for today', async () => {
    renderDiary('/diary')

    expect(await screen.findByText('Today')).toBeTruthy()

    for (const meal of ['Breakfast', 'Lunch', 'Dinner', 'Snacks']) {
      expect(screen.getByText(meal)).toBeTruthy()
    }

    // Seeded breakfast is visible
    expect(await screen.findByText('Porridge Oats')).toBeTruthy()

    // Drink entries are grouped with a count
    const coffees = seed.drinkEntriesFor(seed.TODAY).filter((entry) => entry.name === 'Black Coffee').length
    expect(await screen.findByText(`Black Coffee × ${coffees}`)).toBeTruthy()

    // Dinner is deliberately unlogged today (it is only ~mid-afternoon in the demo)
    expect(screen.getByText('Nothing logged yet')).toBeTruthy()
  })

  it("shows the bank surplus and today's available allowance", async () => {
    renderDiary(`/diary/${todayIso()}`)

    const bank = handle('GET', new URL(`http://localhost/api/bank?date=${seed.TODAY}`), null)
    const expected = (bank?.body as { bank_balance: number; today_available: number; daily_goal: number })

    expect(await screen.findByText('Banked')).toBeTruthy()
    expect(await screen.findByText(`of ${formatNumber(expected.today_available)} kcal`)).toBeTruthy()
    expect(await screen.findByText(`+${formatNumber(expected.bank_balance)}`)).toBeTruthy()
  })

  it('renders a past date from the route param, with every meal logged', async () => {
    const past = addDays(todayIso(), -7)
    renderDiary(`/diary/${past}`)

    // Full date is shown in the header rather than "Today"
    const pretty = new Date(`${past}T12:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    expect(await screen.findByText(pretty)).toBeTruthy()

    // Ring shows the seeded day's total
    const expectedCalories = Math.round(seed.totalsFor(past).calories)
    expect(await screen.findByText(formatNumber(expectedCalories))).toBeTruthy()

    // Past days are complete: no empty meal sections
    expect(screen.queryAllByText('Nothing logged yet')).toHaveLength(0)
  })
})
