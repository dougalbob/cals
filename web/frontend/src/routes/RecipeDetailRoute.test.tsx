// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { resetFixtures } from '../../mock-api/seed.mjs'
import { RecipeDetailRoute } from './RecipeDetailRoute'
import { formatGrams } from '../lib/format'
import { fractionGrams } from '../lib/recipePortion'

/** The fixture seed is a plain array, so narrow it once for the assertions. */
function seedRecipe(id: number) {
  const recipe = seed.recipes.find((candidate) => candidate.id === id)
  if (!recipe) throw new Error(`recipe ${id} is missing from the fixture seed`)
  return recipe
}

function renderRoute(recipeId = 1) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/recipes/${recipeId}`]}>
        <Routes>
          <Route path="/recipes/:id" element={<RecipeDetailRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetFixtures()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const result = handle(
      init?.method ?? 'GET',
      url,
      init?.body ? JSON.parse(String(init.body)) : null,
    )
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

describe('RecipeDetailRoute', () => {
  it('shows structured tags and lets the user add or change shared metadata', async () => {
    renderRoute()

    expect(await screen.findByRole('heading', { name: 'Chicken Curry' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Ingredients' })).toBeTruthy()
    const tagGroup = screen.getByRole('group', { name: 'Chicken Curry tags' })
    expect(tagGroup.textContent).toContain('Lunch')
    expect(tagGroup.textContent).toContain('Dinner')
    expect(tagGroup.textContent).toContain('Main')
    expect(tagGroup.textContent).toContain('Chicken Breast, grilled')

    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Snack' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Dish type' }), {
      target: { value: 'side' },
    })

    const rice = screen.getByRole('checkbox', { name: 'Basmati Rice, cooked' }) as HTMLInputElement
    const broccoli = screen.getByRole('checkbox', { name: 'Broccoli, steamed' }) as HTMLInputElement
    expect(rice.checked).toBe(true)
    expect(broccoli.disabled).toBe(true)
    fireEvent.click(rice)
    fireEvent.click(broccoli)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Total prep-to-plate time (minutes)' }), {
      target: { value: '75' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save tags and time' }))

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).toContain('Snack')
      expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).toContain('Side')
      expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).toContain('Broccoli, steamed')
      expect(screen.queryByRole('button', { name: 'Save tags and time' })).toBeNull()
    })
    expect(screen.getByText('75 min total')).toBeTruthy()
  })
})

describe('RecipeDetailRoute archive and restore', () => {
  it('archives after a confirmation, then offers Restore and stops offering Add to diary', async () => {
    renderRoute(3)
    expect(await screen.findByRole('heading', { name: 'Salmon Traybake' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add to diary/ })).toBeTruthy()
    expect(screen.queryByText('This recipe is archived')).toBeNull()

    // Two steps, so one stray tap cannot retire a shared recipe.
    fireEvent.click(screen.getByRole('button', { name: 'Archive recipe' }))
    expect(seedRecipe(3).is_archived).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, archive it' }))

    expect(await screen.findByText('This recipe is archived')).toBeTruthy()
    expect(seedRecipe(3).is_archived).toBe(true)
    expect(screen.queryByRole('button', { name: /Add to diary/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Archive recipe' })).toBeNull()
    // The recipe itself is still fully readable.
    expect(screen.getByRole('heading', { name: 'Ingredients' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Restore recipe' }))
    await waitFor(() => expect(screen.queryByText('This recipe is archived')).toBeNull())
    expect(seedRecipe(3).is_archived).toBe(false)
    expect(screen.getByRole('button', { name: /Add to diary/ })).toBeTruthy()
  })

  it('lets the user back out of archiving', async () => {
    renderRoute(3)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive recipe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.getByRole('button', { name: 'Archive recipe' })).toBeTruthy()
    expect(seedRecipe(3).is_archived).toBe(false)
  })

  it('opens an archived recipe from a link and keeps recorded history untouched', async () => {
    const before = seed.diaryEntries.map((entry) => ({ ...entry }))
    handle('PUT', new URL('/api/recipes/1/archive', 'http://localhost'), { is_archived: true })

    renderRoute(1)
    expect(await screen.findByText('This recipe is archived')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Chicken Curry' })).toBeTruthy()

    expect(seed.diaryEntries).toEqual(before)
  })

  it('refuses to log an archived recipe at the API, not just in the UI', () => {
    handle('PUT', new URL('/api/recipes/2/archive', 'http://localhost'), { is_archived: true })
    const refused = handle('POST', new URL('/api/diary', 'http://localhost'), {
      date: '2026-10-03', meal: 'breakfast', recipe_id: 2, quantity_grams: 100, calories: 50,
    })
    expect(refused?.status).toBe(409)
  })
})

describe('RecipePortionSheet', () => {
  it('guesses nothing on a first log, then remembers the first portion as usual', async () => {
    renderRoute()

    expect(await screen.findByRole('heading', { name: 'Chicken Curry' })).toBeTruthy()
    const existingIds = new Set(seed.entriesFor(seed.TODAY).map((entry) => entry.id))
    const before = seed.entriesFor(seed.TODAY).length
    expect(seed.usualGramsFor(1)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Add to diary/ }))
    const sheet = screen.getByRole('dialog')

    // No usual yet: nothing is preselected, so logging is not allowed until the
    // user chooses a fraction or types grams (owner decision 32).
    expect(within(sheet).getByText(/nothing is guessed for you/)).toBeTruthy()
    expect((within(sheet).getByRole('button', { name: 'Add to diary' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(within(sheet).getByRole('button', { name: /½/ }))
    const half = fractionGrams(seedRecipe(1).total_weight_grams, 0.5) as number
    expect(half).toBeGreaterThan(0)
    expect(within(sheet).getByText(new RegExp(`^${formatGrams(half)} = `))).toBeTruthy()

    fireEvent.click(within(sheet).getByRole('button', { name: /Lunch/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add to diary' }))

    // Confirms what was stored, and that the first log became the usual.
    const status = await within(sheet).findByRole('status')
    expect(status.textContent).toContain(formatGrams(half))
    expect(status.textContent).toMatch(/usual portion/)

    const entries = seed.entriesFor(seed.TODAY)
    expect(entries.length).toBe(before + 1)
    const logged = entries.find((entry) => !existingIds.has(entry.id)) as (typeof entries)[number]
    expect(logged).toBeTruthy()
    expect(logged.recipe_id).toBe(1)
    expect(logged.meal).toBe('lunch')
    expect(logged.quantity_grams).toBe(half)
    // The snapshot comes from the recipe's per-100 g values, so the stored
    // calories are the whole portion rather than a definition re-read later.
    expect(logged.calories).toBeCloseTo(
      (seedRecipe(1).calories_per_100g / 100) * half,
      6,
    )
    expect(seed.usualGramsFor(1)).toBe(half)
  })

  it('prefills a saved usual and keeps later amounts one-off unless asked', async () => {
    renderRoute(3)

    fireEvent.click(await screen.findByRole('button', { name: /Add to diary/ }))
    const sheet = screen.getByRole('dialog')

    // The seeded usual is prefilled and named in the sheet.
    const usual = seed.usualGramsFor(3) as number
    expect(usual).toBeGreaterThan(0)
    expect((within(sheet).getByLabelText('Weight (grams)') as HTMLInputElement).value).toBe(String(usual))
    expect(within(sheet).getByText(new RegExp(`^${formatGrams(usual)} = `))).toBeTruthy()

    const before = seed.entriesFor(seed.TODAY).length

    // A different amount offers to become the usual, but defaults to one-off.
    fireEvent.click(within(sheet).getByRole('button', { name: /¾/ }))
    const threeQuarters = fractionGrams(seedRecipe(3).total_weight_grams, 0.75) as number
    expect(within(sheet).getByText(new RegExp(`^${formatGrams(threeQuarters)} = `))).toBeTruthy()
    const makeUsual = within(sheet).getByLabelText('Make this my usual portion') as HTMLInputElement
    expect(makeUsual.checked).toBe(false)

    fireEvent.click(within(sheet).getByRole('button', { name: 'Add to diary' }))
    await within(sheet).findByRole('status')
    expect(seed.usualGramsFor(3)).toBe(usual)
    expect(seed.entriesFor(seed.TODAY).length).toBe(before + 1)
  })
})
