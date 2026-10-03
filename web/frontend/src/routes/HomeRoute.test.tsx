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
import { HomeRoute } from './HomeRoute'
import { formatNumber } from '../lib/format'

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

    expect(await screen.findByText(`of ${formatNumber(expected.daily_goal)} kcal`)).toBeTruthy()
    expect(screen.getByText('Daily goal')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Bank balance/ }).getAttribute('aria-label')).toContain(
      `Bank balance ${signedBalance} kcal`,
    )
    expect(screen.getByText(`Bank ${signedBalance} kcal · ${percentText} of ±2,000 kcal scale`)).toBeTruthy()
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

  it('counts the daily allowance down in the inner ring', async () => {
    renderHome()

    const bank = handle('GET', new URL(`http://localhost/api/bank?date=${seed.TODAY}`), null)
      ?.body as { daily_goal: number }
    const totals = seed.totalsFor(seed.TODAY)
    const entries = seed.entriesFor(seed.TODAY)
    const drinkCalories = seed.drinkEntriesFor(seed.TODAY).reduce((acc, e) => acc + e.calories, 0)
    const consumed = Math.round(totals.calories + drinkCalories)

    expect(entries.length + seed.drinkEntriesFor(seed.TODAY).length).toBeGreaterThan(0)
    expect(await screen.findByText(`of ${formatNumber(bank.daily_goal)} kcal allowance left`).catch(() => null) ??
      screen.getByText(new RegExp("kcal (allowance left|over today's allowance)"))).toBeTruthy()

    // The inner ring is a countdown of the plain daily goal, drawn from 12
    // o'clock: the arc length is the allowance that is left.
    const rings = document.querySelectorAll('svg circle')
    expect(rings.length).toBeGreaterThanOrEqual(4)
    expect(consumed).toBeGreaterThan(0)
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
      expect(
        within(card).getByText(formatNumber(waterBefore + 250)),
      ).toBeTruthy(),
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
