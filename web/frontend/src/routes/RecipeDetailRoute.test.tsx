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
    const ownCreation = screen.getByRole('checkbox', { name: 'Own creation' }) as HTMLInputElement
    expect(ownCreation.checked).toBe(false)
    const ownCreationBlock = ownCreation.closest('fieldset')
    const keyFoodsBlock = screen.getByText('Key foods (choose up to two)').closest('fieldset')
    if (!ownCreationBlock || !keyFoodsBlock) throw new Error('recipe-origin/key-food fieldsets not found')
    expect(ownCreationBlock.compareDocumentPosition(keyFoodsBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(ownCreation)
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
      expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).toContain('Own creation')
      expect(screen.queryByRole('button', { name: 'Save tags and time' })).toBeNull()
    })
    expect(seedRecipe(1).is_own_creation).toBe(true)
    const ownTag = within(screen.getByRole('group', { name: 'Chicken Curry tags' })).getByRole('link', {
      name: 'Show recipes tagged Own creation',
    })
    expect(ownTag.className).toContain('bg-orange-200')
    expect(screen.getByText('75 min total')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Own creation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save tags and time' }))
    await waitFor(() => expect(seedRecipe(1).is_own_creation).toBe(false))
    expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).not.toContain('Own creation')
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

describe('Recipe content editing', () => {
  it('edits shared content, keeps the name fixed and preserves existing Diary snapshots', async () => {
    const diaryBefore = seed.diaryEntries.map((entry) => ({ ...entry }))
    renderRoute(1)

    expect(await screen.findByRole('heading', { name: 'Chicken Curry' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }))

    const editor = screen.getByRole('dialog', { name: 'Edit Chicken Curry' })
    const fixedName = within(editor).getByRole('textbox', { name: 'Recipe name (fixed)' }) as HTMLInputElement
    expect(fixedName.readOnly).toBe(true)
    expect(fixedName.value).toBe('Chicken Curry')

    fireEvent.change(within(editor).getByLabelText('Description'), {
      target: { value: 'A lighter version for weeknights.' },
    })
    fireEvent.change(within(editor).getByLabelText('Method / instructions'), {
      target: { value: 'Simmer gently and serve warm.' },
    })
    fireEvent.change(within(editor).getByRole('spinbutton', { name: 'Serves' }), {
      target: { value: '3' },
    })
    fireEvent.change(within(editor).getByRole('spinbutton', {
      name: 'Chicken Breast, grilled weight (grams) 1',
    }), { target: { value: '300' } })
    fireEvent.change(within(editor).getByRole('spinbutton', { name: 'Cooked weight (grams)' }), {
      target: { value: '900' },
    })
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Text ingredient 1' }), {
      target: { value: 'Fresh ginger' },
    })

    fireEvent.change(within(editor).getByRole('searchbox', { name: 'Search cals Foods to add' }), {
      target: { value: 'Blueberries' },
    })
    fireEvent.click(await within(editor).findByRole('button', { name: 'Add' }))
    fireEvent.click(within(editor).getByRole('button', { name: '+ Add text ingredient' }))
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Text ingredient 4' }), {
      target: { value: 'A squeeze of lemon' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save recipe' }))

    await waitFor(() => {
      expect(seedRecipe(1).description).toBe('A lighter version for weeknights.')
      expect(screen.queryByRole('dialog', { name: 'Edit Chicken Curry' })).toBeNull()
    })
    const updated = seedRecipe(1)
    expect(updated.name).toBe('Chicken Curry')
    expect(updated.instructions).toBe('Simmer gently and serve warm.')
    expect(updated.serves).toBe(3)
    expect(updated.weight_is_manual).toBe(true)
    expect(updated.total_weight_grams).toBe(900)
    expect(updated.ingredients.some((ingredient) => ingredient.food_name === 'Blueberries')).toBe(true)
    expect(updated.ingredients.find((ingredient) => ingredient.food_name === 'Chicken Breast, grilled')?.quantity_grams).toBe(300)
    expect(updated.text_ingredients.map((ingredient) => ingredient.description)).toContain('Fresh ginger')
    expect(updated.text_ingredients.map((ingredient) => ingredient.description)).toContain('A squeeze of lemon')
    expect(seed.diaryEntries).toEqual(diaryBefore)
    expect(screen.getByText('A lighter version for weeknights.')).toBeTruthy()
    expect(screen.getByText('900 g cooked')).toBeTruthy()
  })

  it('rejects recipe-name changes at the fixture API boundary', () => {
    const before = { ...seedRecipe(1) }
    const diaryBefore = seed.diaryEntries.map((entry) => ({ ...entry }))
    for (const attemptedName of ['Renamed Curry', ' Chicken Curry ']) {
      const response = handle('PUT', new URL('/api/recipes/1', 'http://localhost'), {
        name: attemptedName,
      })
      expect(response?.status).toBe(400)
    }
    expect(seedRecipe(1).name).toBe(before.name)
    expect(seed.diaryEntries).toEqual(diaryBefore)
  })

  it('recalculates dependent recipe definitions after a food correction without rewriting Diary rows', () => {
    const chicken = seed.foods.find((food) => food.id === 5)
    expect(chicken).toBeTruthy()
    const affected = seed.recipes.filter((recipe) => recipe.ingredients.some((ingredient) => ingredient.food_id === 5))
    expect(affected.length).toBeGreaterThan(1)
    const weights = new Map(affected.map((recipe) => [recipe.id, {
      cooked: recipe.total_weight_grams,
      manual: recipe.weight_is_manual,
    }]))
    const diaryBefore = seed.diaryEntries.map((entry) => ({ ...entry }))
    handle('PUT', new URL('/api/recipes/1/archive', 'http://localhost'), { is_archived: true })

    const response = handle('PUT', new URL('/api/foods/5', 'http://localhost'), {
      name: 'Corrected Chicken Breast',
      calories_per_100g: 200,
      protein_per_100g: 35,
      carbs_per_100g: 1,
      fat_per_100g: 5,
      fibre_per_100g: 0.3,
      serving_name: 'Large breast',
      serving_grams: 180,
      servings: [],
    })
    expect(response?.status).toBe(200)

    for (const recipe of affected) {
      expect(recipe.total_calories).not.toBe(0)
      expect(recipe.ingredients.find((ingredient) => ingredient.food_id === 5)?.food_name).toBe('Corrected Chicken Breast')
      expect(recipe.total_weight_grams).toBe(weights.get(recipe.id)?.cooked)
      expect(recipe.weight_is_manual).toBe(weights.get(recipe.id)?.manual)
    }
    expect(seedRecipe(1).is_archived).toBe(true)
    expect(seed.diaryEntries).toEqual(diaryBefore)
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
