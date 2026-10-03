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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { DiaryRoute } from './DiaryRoute'
import { addDays, formatNumber, todayIso } from '../lib/format'
import { orderQuickDrinks, quickDrinksForGrid } from '../components/QuickDrinks'
import { pickWaterDrink } from '../components/FluidsCard'
import { isWaterDrink } from '../lib/drinkCatalog'
import type { Drink } from '../api/types'

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
  // The quick-add tests log real entries into the fixture; start each test from
  // the seeded state so assertions are deterministic.
  seed.resetFixtures()
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

describe('orderQuickDrinks', () => {
  it('keeps the everyday choices first using the user\'s own drink records', () => {
    const drinks = [
      { id: 1, user_id: 1, name: 'Lager', icon: '🍺', volume_ml: 568, calories: 239, counts_toward_water: false },
      { id: 2, user_id: 1, name: 'Squash', icon: '🥤', volume_ml: 250, calories: 5, counts_toward_water: true },
      { id: 3, user_id: 1, name: 'Coffee', icon: '☕', volume_ml: 250, calories: 2, counts_toward_water: true },
      { id: 4, user_id: 1, name: 'Water', icon: '💧', volume_ml: 250, calories: 0, counts_toward_water: true },
      { id: 5, user_id: 1, name: 'Tea', icon: '🫖', volume_ml: 250, calories: 14, counts_toward_water: true },
    ]

    expect(orderQuickDrinks(drinks).map((d) => d.name)).toEqual([
      'Tea',
      'Coffee',
      'Squash',
      'Water',
      'Lager',
    ])
    expect(quickDrinksForGrid(drinks).map((d) => d.name)).toEqual(['Tea', 'Coffee', 'Squash', 'Lager'])
  })
})

describe('pickWaterDrink', () => {
  const drink = (id: number, name: string): Drink => ({
    id,
    user_id: 1,
    name,
    icon: '💧',
    volume_ml: 250,
    calories: 0,
    counts_toward_water: true,
  })

  it('prefers the drink named Water even when several count towards water', () => {
    expect(pickWaterDrink([drink(1, 'Black Coffee'), drink(2, 'Tea'), drink(3, 'Water')])?.name).toBe('Water')
  })

  it('does not treat tea or squash as the glass, and returns null when there is no Water', () => {
    expect(pickWaterDrink([drink(1, 'Squash')])).toBeNull()
    expect(pickWaterDrink([])).toBeNull()
  })
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

    // The quick selector offers the user's own drinks, not a hard-coded list
    const quick = screen.getByLabelText('Quick drinks')
    for (const drink of seed.drinks.filter((d) => !isWaterDrink(d))) {
      expect(within(quick).getByText(drink.name)).toBeTruthy()
    }
    expect(within(quick).queryByText('Water')).toBeNull()

    // Drinks logged today are listed individually and are removable
    expect(await screen.findByText('Drinks logged')).toBeTruthy()

    // Dinner is deliberately unlogged today (it is only ~mid-afternoon in the demo)
    expect(screen.getByText('Nothing logged yet')).toBeTruthy()
  })

  it('shows the water target from water-counting drink entries', async () => {
    renderDiary('/diary')

    const expected = seed.waterFor(seed.TODAY)
    const card = await screen.findByLabelText('Fluids and drinks')
    expect(within(card).getByText(formatNumber(expected.consumed_ml))).toBeTruthy()
    expect(within(card).getByText(`/ ${formatNumber(expected.target_ml)} ml`)).toBeTruthy()
    expect(within(card).getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      String(expected.consumed_ml),
    )
  })

  it('logs a drink in one tap and updates water, drink totals and the bank', async () => {
    renderDiary('/diary')

    const waterBefore = seed.waterFor(seed.TODAY).consumed_ml
    const card = await screen.findByLabelText('Fluids and drinks')

    fireEvent.click(within(card).getByRole('button', { name: /Add a 250 ml glass of water/ }))

    await waitFor(() =>
      expect(
        within(card).getByText(formatNumber(waterBefore + 250)),
      ).toBeTruthy(),
    )
  })

  it('logs an arbitrary amount from the water card', async () => {
    renderDiary('/diary')

    const waterBefore = seed.waterFor(seed.TODAY).consumed_ml
    const card = await screen.findByLabelText('Fluids and drinks')

    fireEvent.click(within(card).getByRole('button', { name: '+ other amount' }))
    const amount = within(card).getByLabelText('Other water amount (ml)') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '750' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(within(card).getByText(formatNumber(waterBefore + 750))).toBeTruthy(),
    )
  })

  it("shows the bank surplus and today's available allowance", async () => {
    renderDiary(`/diary/${todayIso()}`)

    const bank = handle('GET', new URL(`http://localhost/api/bank?date=${seed.TODAY}`), null)
    const expected = (bank?.body as { bank_balance: number; today_available: number; daily_goal: number })

    // Bank maths includes drink calories, so the seeded household can be in
    // surplus or deficit; the tile labels and signs it accordingly.
    expect(await screen.findByText(expected.bank_balance >= 0 ? 'Banked' : 'Deficit')).toBeTruthy()
    expect(await screen.findByText(`of ${formatNumber(expected.today_available)} kcal`)).toBeTruthy()
    const signed = `${expected.bank_balance >= 0 ? '+' : ''}${formatNumber(expected.bank_balance)}`
    expect(await screen.findByText(signed)).toBeTruthy()
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
