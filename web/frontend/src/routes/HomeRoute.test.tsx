// @vitest-environment jsdom
/**
 * Behaviour tests for the Today (home) screen.
 *
 * The point of the screen is *summary, not itemisation*: it must answer "where
 * am I today?" without listing every food in every meal. These tests pin that
 * contract, plus the two new visuals — the allowance countdown ring and the
 * water glass, which drains as water is logged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import type { SeedDiaryEntry } from '../../mock-api/seed.mjs'
import { HomeRoute } from './HomeRoute'
import { formatNumber } from '../lib/format'

const DEFAULT_DAILY_WATER_GOAL_ML = seed.user.daily_water_goal_ml

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  seed.resetFixtures()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const result = handle(init?.method ?? 'GET', url, init?.body ? JSON.parse(String(init.body)) : null)
    if (!result) return new Response('not found', { status: 404 })
    // A 204 must not carry a body — `new Response('', { status: 204 })` throws.
    const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    return new Response(result.status === 204 ? null : body, {
      status: result.status,
      headers: { 'Content-Type': result.contentType ?? 'application/json' },
    })
  })
})

afterEach(() => {
  cleanup()
  seed.user.daily_water_goal_ml = DEFAULT_DAILY_WATER_GOAL_ML
  vi.unstubAllGlobals()
})

describe('HomeRoute', () => {
  it("shows today's goal inside and the exact bank balance on the outer ring", async () => {
    renderHome()

    const bank = handle('GET', new URL(`http://localhost/api/bank?date=${seed.TODAY}`), null)
    const expected = bank?.body as { bank_balance: number; daily_goal: number }
    const signedBalance = `${expected.bank_balance > 0 ? '+' : ''}${formatNumber(expected.bank_balance)}`
    const percent = Math.round((Math.min(Math.abs(expected.bank_balance) / 2_000, 1) * 1_000)) / 10
    const percentText = `${formatNumber(percent, Number.isInteger(percent) ? 0 : 1)}%`

    // The wheel labels itself: "bank" (balance plus what is left of today),
    // the day's spend, and "daily". The captions underneath are gone.
    expect(await screen.findByText('bank')).toBeTruthy()
    expect(screen.getByText('daily')).toBeTruthy()
    expect(screen.getByText('Daily goal')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Bank balance/ }).getAttribute('aria-label')).toContain(
      `Bank balance ${signedBalance} kcal`,
    )
    expect(screen.getByRole('img', { name: /Bank balance/ }).getAttribute('aria-label')).toContain(
      `${percentText} of its plus or minus 2,000 kcal display scale`,
    )
    expect(screen.queryByText(/kcal scale/)).toBeNull()
  })

  it('summarises each meal without listing the individual foods', async () => {
    renderHome()

    expect(await screen.findByText('Breakfast')).toBeTruthy()

    // The seeded breakfast item is in the diary, but the home screen shows only
    // the meal's calorie line — the itemised list lives in the Diary.
    const breakfastEntry = seed.entriesFor(seed.TODAY).find((entry) => entry.meal === 'breakfast')
    expect(breakfastEntry).toBeTruthy()
    expect(screen.queryByText(breakfastEntry!.food_name ?? '')).toBeNull()
  })

  it('fills each meal card in proportion to its share of today’s meal calories', async () => {
    const otherDays = seed.diaryEntries.filter((entry) => entry.date !== seed.TODAY)
    const mealEntries: SeedDiaryEntry[] = [
      ['breakfast', 300],
      ['lunch', 200],
      ['dinner', 400],
      ['snacks', 100],
    ].map(([meal, calories], index) => ({
      id: 9001 + index,
      user_id: 1,
      date: seed.TODAY,
      meal: meal as SeedDiaryEntry['meal'],
      food_id: null,
      recipe_id: null,
      quantity_grams: 100,
      calories: Number(calories),
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      created_at: `${seed.TODAY}T08:00:00Z`,
      updated_at: `${seed.TODAY}T08:00:00Z`,
    }))
    seed.diaryEntries.splice(0, seed.diaryEntries.length, ...otherDays, ...mealEntries)

    renderHome()

    const meals = await screen.findByLabelText('Meals today')
    const fills = Array.from(meals.querySelectorAll<HTMLElement>('[data-calorie-fill]'))
    expect(fills.map((fill) => fill.style.width)).toEqual(['30%', '20%', '40%', '10%'])

    const dinner = within(meals).getByRole('link', { name: /Dinner: 400 kcal/ })
    const dinnerFill = dinner.querySelector<HTMLElement>('[data-calorie-fill]')
    expect(dinnerFill?.className).toContain('bg-primary-light/50')
    expect(dinnerFill?.getAttribute('aria-hidden')).toBe('true')
    expect(dinner.children[0]).toBe(dinnerFill)
    expect(dinner.querySelector('.relative.z-10')).toBeTruthy()
  })

  it('counts the daily allowance down in the inner ring', async () => {
    renderHome()

    const bank = handle('GET', new URL(`http://localhost/api/bank?date=${seed.TODAY}`), null)
      ?.body as { daily_goal: number }
    const totals = seed.totalsFor(seed.TODAY)
    const entries = seed.entriesFor(seed.TODAY)
    const drinkCalories = seed.drinkEntriesFor(seed.TODAY).reduce((acc, e) => acc + e.calories, 0)
    const consumed = Math.round(totals.calories + drinkCalories)

    expect(entries.length + seed.drinkEntriesFor(seed.TODAY).length).toBeGreaterThan(0)
    // Today's remainder is the hub's bottom line, signed and colour-coded.
    const dailyLeft = bank.daily_goal - consumed
    const dailyText = `${dailyLeft < 0 ? '−' : '+'}${formatNumber(Math.abs(dailyLeft))}`
    expect(await screen.findByText('daily')).toBeTruthy()
    expect(screen.getAllByText(dailyText).length).toBeGreaterThan(0)

    // The inner ring is a countdown of the plain daily goal, drawn from 12
    // o'clock: the arc length is the allowance that is left.
    const rings = document.querySelectorAll('svg circle')
    expect(rings.length).toBeGreaterThanOrEqual(4)
    expect(consumed).toBeGreaterThan(0)
  })

  it('shows the updated daily target inside the glass and in the remaining amount', async () => {
    seed.user.daily_water_goal_ml = 1000
    seed.drinkEntries.splice(
      0,
      seed.drinkEntries.length,
      ...seed.drinkEntries.filter((entry) => entry.date !== seed.TODAY),
    )
    renderHome()

    const card = await screen.findByLabelText('Fluids and drinks')
    expect(await within(card).findByText('1,000 ml')).toBeTruthy()
    expect(within(card).getByText('1,000')).toBeTruthy()
    expect(within(card).getByText('ml to go')).toBeTruthy()
    expect(within(card).queryByText('2,000 ml')).toBeNull()
  })

  it('drains the water glass as water is logged, in one tap', async () => {
    renderHome()

    const waterBefore = seed.waterFor(seed.TODAY).consumed_ml
    const target = seed.waterFor(seed.TODAY).target_ml
    const card = await screen.findByLabelText('Fluids and drinks')

    // The glass level is "what is left", not "what has been drunk".
    const before = within(card).getByRole('progressbar')
    expect(before.getAttribute('aria-valuenow')).toBe(String(Math.min(waterBefore, target)))

    fireEvent.click(within(card).getByRole('button', { name: /Add a 250 ml glass of water/ }))

    await waitFor(() =>
      expect(within(card).getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
        String(Math.min(waterBefore + 250, target)),
      ),
    )
  })
  it('confirms long-press deletion of a glass without adding an extra drink', async () => {
    renderHome()
    const card = await screen.findByLabelText('Fluids and drinks')
    const before = seed.drinkEntriesFor(seed.TODAY).filter((e) => e.drink_id === 3).length
    const waterBefore = seed.waterFor(seed.TODAY).consumed_ml
    const button = within(card).getByRole('button', { name: /Add a 250 ml glass of water/ })
    expect(before).toBeGreaterThan(0)
    vi.stubGlobal('PointerEvent', MouseEvent)
    fireEvent.pointerDown(button, { button: 0 })
    expect(await screen.findByRole('dialog', { name: 'Delete drink entry?' })).toBeTruthy()
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(seed.drinkEntriesFor(seed.TODAY).filter((e) => e.drink_id === 3).length).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(
        within(card).getByRole('button', {
          name: `Add a 250 ml glass of water${before - 1 > 0 ? `, ${before - 1} logged today` : ''}`,
        }),
      ).toBeTruthy(),
    )
    expect(seed.waterFor(seed.TODAY).consumed_ml).toBe(waterBefore - 250)
  })

  it('keeps Water off the 2×2 and links to My drinks', async () => {
    renderHome()
    const quick = await screen.findByLabelText('Quick drinks')
    expect(within(quick).queryByRole('button', { name: /^Add Water/ })).toBeNull()
    expect(within(quick).getByRole('link', { name: 'My drinks' })).toBeTruthy()
    expect(within(quick).getByRole('button', { name: /^Add Tea/ })).toBeTruthy()
  })

})
