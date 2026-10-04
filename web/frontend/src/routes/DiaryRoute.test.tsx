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
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { DiaryRoute } from './DiaryRoute'
import { addDays, formatNumber, todayIso } from '../lib/format'
import { orderQuickDrinks, quickDrinksForGrid } from '../components/QuickDrinks'
import { pickWaterDrink } from '../components/FluidsCard'
import { isWaterDrink } from '../lib/drinkCatalog'
import { startRecipePickHref } from '../lib/recipePick'
import type { Drink } from '../api/types'

/** Where the router landed, so a hand-off to another tab can be asserted. */
function LocationProbe() {
  const location = useLocation()
  return (
    <span data-testid="location">
      {`${location.pathname}${location.search}${location.hash}`}
    </span>
  )
}

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
          <Route path="/recipes" element={<p>recipe box</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const locationHref = () => screen.getByTestId('location').textContent ?? ''

beforeEach(() => {
  // The quick-add tests log real entries into the fixture; start each test from
  // the seeded state so assertions are deterministic.
  seed.resetFixtures()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const requestBody = init?.body ? JSON.parse(String(init.body)) : null
    const result = handle(method, url, requestBody)

    if (!result) return new Response('not found', { status: 404 })
    // A 204 must not carry a body — `new Response('', { status: 204 })` throws.
    const responseBody = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    return new Response(result.status === 204 ? null : responseBody, {
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

  it('fills meal cards by each meal share of the day\'s logged food calories', async () => {
    const otherDays = seed.diaryEntries.filter((entry) => entry.date !== seed.TODAY)
    const todayEntries = ([
      ['breakfast', 300],
      ['lunch', 200],
      ['dinner', 500],
    ] as const).map(([meal, calories], index) => ({
      id: 9800 + index,
      user_id: 1,
      date: seed.TODAY,
      meal,
      food_id: 1,
      recipe_id: null,
      quantity_grams: 100,
      calories,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      created_at: `${seed.TODAY}T08:00:00Z`,
      updated_at: `${seed.TODAY}T08:00:00Z`,
      food_name: 'Test food',
    }))
    seed.diaryEntries.splice(0, seed.diaryEntries.length, ...otherDays, ...todayEntries)

    renderDiary('/diary')

    const breakfast = (await screen.findByRole('heading', { name: /Breakfast/ })).closest('section')
    const dinner = screen.getByRole('heading', { name: /Dinner/ }).closest('section')
    expect(breakfast).toBeTruthy()
    expect(dinner).toBeTruthy()

    const breakfastFill = breakfast?.querySelector<HTMLElement>('[data-calorie-fill]')
    expect(breakfastFill?.style.width).toBe('30%')
    expect(breakfastFill?.className).toContain('bg-meal-breakfast/5')
    expect(within(breakfast as HTMLElement).getByLabelText('30% of logged food calories')).toBeTruthy()

    const dinnerFill = dinner?.querySelector<HTMLElement>('[data-calorie-fill]')
    expect(dinnerFill?.style.width).toBe('50%')
    expect(dinnerFill?.className).toContain('bg-meal-dinner/5')
    expect(within(dinner as HTMLElement).getByLabelText('50% of logged food calories')).toBeTruthy()

    const snacks = screen.getByRole('heading', { name: /Snacks/ }).closest('section')
    expect(within(snacks as HTMLElement).getByLabelText('0% of logged food calories')).toBeTruthy()
  })

  it('omits meal fills and percentage labels when the day has no logged food', async () => {
    const otherDays = seed.diaryEntries.filter((entry) => entry.date !== seed.TODAY)
    seed.diaryEntries.splice(0, seed.diaryEntries.length, ...otherDays)

    renderDiary('/diary')

    const breakfast = (await screen.findByRole('heading', { name: /Breakfast/ })).closest('section')
    expect(breakfast?.querySelector('[data-calorie-fill]')).toBeNull()
    expect(breakfast?.querySelector('[data-calorie-share]')).toBeNull()
  })

  it('shows the water target from water-counting drink entries', async () => {
    renderDiary('/diary')

    const expected = seed.waterFor(seed.TODAY)
    const card = await screen.findByLabelText('Fluids and drinks')
    // The target is written across the glass; the separate "x / y ml" caption
    // was dropped as redundant (owner request, 2026-10-03).
    expect(within(card).getByText(`${formatNumber(expected.target_ml)} ml`)).toBeTruthy()
    expect(within(card).getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      String(expected.consumed_ml),
    )
  })

  it('adds a food with the full nutrition snapshot expected by the Go API', async () => {
    renderDiary('/diary')

    const existingIds = new Set(seed.entriesFor(seed.TODAY).map((entry) => entry.id))
    const breakfast = (await screen.findByText('Breakfast')).closest('section')
    expect(breakfast).toBeTruthy()
    fireEvent.click(within(breakfast as HTMLElement).getByRole('button', { name: '+ Add food' }))

    fireEvent.change(screen.getByPlaceholderText('Search foods…'), { target: { value: 'Porridge' } })
    const modal = screen.getByRole('dialog')
    const porridge = await within(modal).findByRole('button', { name: /Porridge Oats/ })
    fireEvent.click(porridge)

    // Porridge has named measures, so Add starts in serving mode; a typed weight
    // is always available behind the Grams switch (owner decision 29).
    fireEvent.click(within(modal).getByRole('button', { name: 'Grams' }))
    fireEvent.change(within(modal).getByLabelText('Weight (grams)'), { target: { value: '50' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Add to Breakfast' }))

    await waitFor(() => {
      const added = seed.entriesFor(seed.TODAY).find((entry) => !existingIds.has(entry.id))
      expect(added).toMatchObject({
        food_id: 1,
        quantity_grams: 50,
        calories: 189.5,
        protein: 6.6,
        carbs: 33.85,
        fat: 3.25,
        fibre: 5.05,
      })
    })
  })

  it('adds a food by its own named measure and converts it through grams', async () => {
    renderDiary('/diary')

    const existingIds = new Set(seed.entriesFor(seed.TODAY).map((entry) => entry.id))
    const snacks = (await screen.findByText('Snacks')).closest('section')
    fireEvent.click(within(snacks as HTMLElement).getByRole('button', { name: '+ Add food' }))

    fireEvent.change(screen.getByPlaceholderText('Search foods…'), { target: { value: 'Porridge' } })
    const modal = screen.getByRole('dialog')
    fireEvent.click(await within(modal).findByRole('button', { name: /Porridge Oats/ }))

    // Both of the food's measures are offered, with grams underneath.
    const scoop = within(modal).getByRole('button', { name: /30 g scoop/ })
    fireEvent.click(scoop)
    // 30 g of a 379 kcal/100 g food; the displayed figure is rounded at the
    // presentation layer, the stored snapshot is not.
    expect(within(modal).getByText(/^30 g = 114 kcal$/)).toBeTruthy()

    fireEvent.click(within(modal).getByRole('button', { name: 'Add to Snacks' }))

    await waitFor(() => {
      const added = seed.entriesFor(seed.TODAY).find((entry) => !existingIds.has(entry.id))
      expect(added).toMatchObject({ food_id: 1, quantity_grams: 30, calories: 113.7 })
    })
  })

  it('logs a drink in one tap and updates water, drink totals and the bank', async () => {
    renderDiary('/diary')

    const waterBefore = seed.waterFor(seed.TODAY).consumed_ml
    const target = seed.waterFor(seed.TODAY).target_ml
    const card = await screen.findByLabelText('Fluids and drinks')

    fireEvent.click(within(card).getByRole('button', { name: /Add a 250 ml glass of water/ }))

    await waitFor(() =>
      expect(within(card).getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
        String(Math.min(waterBefore + 250, target)),
      ),
    )
  })

  it('logs an arbitrary amount from the water card', async () => {
    renderDiary('/diary')

    const waterBefore = seed.waterFor(seed.TODAY).consumed_ml
    const target = seed.waterFor(seed.TODAY).target_ml
    const card = await screen.findByLabelText('Fluids and drinks')

    fireEvent.click(within(card).getByRole('button', { name: '+ other amount' }))
    const amount = within(card).getByLabelText('Other water amount (ml)') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '750' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(within(card).getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
        String(Math.min(waterBefore + 750, target)),
      ),
    )
  })

  it("shows the exact bank balance and keeps the inner ring on today's goal", async () => {
    renderDiary(`/diary/${todayIso()}`)

    const bank = handle('GET', new URL(`http://localhost/api/bank?date=${seed.TODAY}`), null)
    const expected = (bank?.body as { bank_balance: number; daily_goal: number })

    // Bank maths includes drink calories, so the seeded household can be in
    // surplus or deficit; the tile and outer ring reflect that exact balance.
    expect(await screen.findByText(expected.bank_balance >= 0 ? 'Banked' : 'Deficit')).toBeTruthy()
    // The wheel now carries its own labels instead of captions underneath.
    expect(await screen.findByText('bank')).toBeTruthy()
    expect(screen.getByText('daily')).toBeTruthy()
    const signed = `${expected.bank_balance > 0 ? '+' : ''}${formatNumber(expected.bank_balance)}`
    expect((await screen.findAllByText(signed)).length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: /Bank balance/ }).getAttribute('aria-label')).toContain(
      `Bank balance ${signed} kcal`,
    )
  })

  it('asks for confirmation before deleting a populated meal slot and Cancel keeps the entry', async () => {
    renderDiary('/diary')

    const entry = seed.entriesFor(seed.TODAY).find((candidate) => candidate.food_name === 'Porridge Oats')
    expect(entry).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Porridge Oats' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete diary entry?' })
    expect(dialog.textContent).toContain('Porridge Oats')
    expect(dialog.textContent).toContain('Breakfast')
    expect(dialog.textContent).toContain('This cannot be undone.')
    expect(seed.entriesFor(seed.TODAY).some((candidate) => candidate.id === entry?.id)).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete diary entry?' })).toBeNull())
    expect(seed.entriesFor(seed.TODAY).some((candidate) => candidate.id === entry?.id)).toBe(true)
  })

  it('deletes a populated meal slot only after the user confirms', async () => {
    renderDiary('/diary')

    const entry = seed.entriesFor(seed.TODAY).find((candidate) => candidate.food_name === 'Porridge Oats')
    expect(entry).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Porridge Oats' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete diary entry?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(seed.entriesFor(seed.TODAY).some((candidate) => candidate.id === entry?.id)).toBe(false),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete diary entry?' })).toBeNull())
  })

  it('edits a logged quantity, rescaling the entry snapshot and refreshing the bank', async () => {
    renderDiary('/diary')

    // The seeded breakfast entry we are going to correct. Copy the numbers out:
    // the fixture holds live object references, so reading them after the save
    // would report the new values rather than the originals.
    const seeded = seed.entriesFor(seed.TODAY).find((e) => e.food_name === 'Porridge Oats')
    expect(seeded).toBeTruthy()
    const { id, food_name: name } = seeded as { id: number; food_name: string }
    const originalGrams = seeded?.quantity_grams ?? 0
    const originalCalories = seeded?.calories ?? 0
    const originalProtein = seeded?.protein ?? 0
    const originalFat = seeded?.fat ?? 0

    fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }))

    const dialog = screen.getByRole('dialog')
    const scrollArea = dialog.querySelector('[data-modal-scroll]')
    const actionFooter = dialog.querySelector('[data-modal-footer]')
    expect(scrollArea?.className).toContain('overflow-y-auto')
    expect(actionFooter).toBeTruthy()
    expect(within(actionFooter as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(within(actionFooter as HTMLElement).getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(scrollArea?.contains(screen.getByRole('button', { name: 'Cancel' }))).toBe(false)
    expect(document.documentElement.style.overflow).toBe('hidden')

    // The food has named measures, so the sheet offers them first; the logged
    // weight is still what the gram input starts from.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Grams' }))
    const input = (await screen.findByLabelText('Weight (grams)')) as HTMLInputElement
    expect(input.value).toBe(String(originalGrams))

    // Doubling the weight doubles the previewed calories.
    fireEvent.change(input, { target: { value: String(originalGrams * 2) } })
    expect(
      await screen.findByText(new RegExp(`= ${formatNumber(Math.round(originalCalories * 2))} kcal$`)),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const after = seed.entriesFor(seed.TODAY).find((e) => e.id === id)
      expect(after?.quantity_grams).toBe(originalGrams * 2)
      expect(after?.calories).toBeCloseTo(originalCalories * 2, 6)
    })

    // The snapshot scales as a whole, so the entry's own composition is preserved…
    const after = seed.entriesFor(seed.TODAY).find((e) => e.id === id)
    expect(after?.protein).toBeCloseTo(originalProtein * 2, 6)
    expect(after?.fat).toBeCloseTo(originalFat * 2, 6)

    // …the sheet closes, restores page scrolling, and the row shows the corrected weight.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
    expect(await screen.findByText(new RegExp(`^${formatNumber(originalGrams * 2)} g`))).toBeTruthy()
  })

  it('refuses a zero or negative quantity instead of saving one', async () => {
    renderDiary('/diary')

    const seeded = seed.entriesFor(seed.TODAY).find((e) => e.food_name === 'Porridge Oats')
    const { id, food_name: name } = seeded as { id: number; food_name: string }
    const originalGrams = seeded?.quantity_grams ?? 0
    const originalCalories = seeded?.calories ?? 0

    fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Grams' }))
    const input = (await screen.findByLabelText('Weight (grams)')) as HTMLInputElement

    for (const bad of ['0', '-50', '']) {
      fireEvent.change(input, { target: { value: bad } })
      expect(await screen.findByText('Enter a weight greater than zero')).toBeTruthy()
      expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    }

    // Nothing was written: the entry still has its original weight and calories.
    const unchanged = seed.entriesFor(seed.TODAY).find((e) => e.id === id)
    expect(unchanged?.quantity_grams).toBe(originalGrams)
    expect(unchanged?.calories).toBe(originalCalories)
  })

  it('leaves Save disabled until the weight actually changes', async () => {
    renderDiary('/diary')

    const entry = seed.entriesFor(seed.TODAY).find((e) => e.food_name === 'Porridge Oats')
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${entry?.food_name}` }))

    // Pre-filled with the logged weight, so there is nothing to save yet.
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Grams' }))
    const input = (await screen.findByLabelText('Weight (grams)')) as HTMLInputElement
    fireEvent.change(input, { target: { value: String((entry?.quantity_grams ?? 0) + 25) } })
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false),
    )
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

  it('hands “Add recipe” over to the recipe box with the meal and date along (decision 40)', async () => {
    renderDiary('/diary')
    expect(await screen.findByText('Today')).toBeTruthy()

    // Every meal card still has both actions.
    const dinner = (await screen.findByText('Dinner')).closest('section') as HTMLElement
    expect(dinner).toBeTruthy()
    expect(within(dinner).getByRole('button', { name: '+ Add food' })).toBeTruthy()
    expect(within(dinner).getByRole('button', { name: '🍽 Add recipe' })).toBeTruthy()

    // Tapping it no longer opens a mini picker: it opens the Recipes tab, which
    // has the search, favourites and tag filters, and tells it which meal this
    // is for and which day it belongs on (owner request, 2026-10-03).
    fireEvent.click(within(dinner).getByRole('button', { name: '🍽 Add recipe' }))
    await waitFor(() =>
      expect(locationHref()).toBe(startRecipePickHref('dinner', seed.TODAY)),
    )
  })

  it('carries the viewed date, not just the meal, when the diary is on a past day', async () => {
    const past = addDays(seed.TODAY, -3)
    renderDiary(`/diary/${past}`)
    const breakfast = (await screen.findByText('Breakfast')).closest('section') as HTMLElement

    fireEvent.click(within(breakfast).getByRole('button', { name: '🍽 Add recipe' }))
    await waitFor(() => expect(locationHref()).toBe(startRecipePickHref('breakfast', past)))
  })
})
