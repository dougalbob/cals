// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { resetFixtures } from '../../mock-api/seed.mjs'
import { RecipeDetailRoute } from './RecipeDetailRoute'
import { addDays, formatGrams, formatNumber } from '../lib/format'
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
    const requestBody = typeof FormData !== 'undefined' && init?.body instanceof FormData
      ? init.body
      : init?.body
        ? JSON.parse(String(init.body))
        : null
    const result = handle(init?.method ?? 'GET', url, requestBody)
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

/** Issue #90, decision 123: cuisine is the recipe card's own selector. */
describe('RecipeDetailRoute cuisine', () => {
  it('shows the saved cuisine as a teal tag that opens the filtered catalogue', async () => {
    renderRoute(1)

    expect(await screen.findByRole('heading', { name: 'Chicken Curry' })).toBeTruthy()
    const cuisineTag = within(screen.getByRole('group', { name: 'Chicken Curry tags' })).getByRole(
      'link',
      { name: 'Show recipes tagged Indian' },
    )
    expect(cuisineTag.className).toContain('bg-teal-100')
    expect(cuisineTag.getAttribute('href')).toBe('/recipes?tags=cuisine%3Aindian')
  })

  it('changes the cuisine from the recipe card’s selector and clears it again', async () => {
    renderRoute(1)
    await screen.findByRole('heading', { name: 'Chicken Curry' })

    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    const cuisineGroup = screen.getByRole('group', { name: 'Cuisine' })
    // The recipe's own cuisine is already selected, not a blank form.
    expect(
      within(cuisineGroup).getByRole('button', { name: 'Remove the Indian cuisine' })
        .getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(within(cuisineGroup).getByRole('button', { name: 'Set the cuisine to Thai' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save tags and time' }))

    await waitFor(() => expect(seedRecipe(1).cuisine).toBe('Thai'))
    expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).toContain('Thai')
    expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).not.toContain('Indian')
  })

  it('creates a cuisine that does not exist yet with “New…”', async () => {
    renderRoute(1)
    await screen.findByRole('heading', { name: 'Chicken Curry' })

    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a cuisine that is not listed' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New cuisine' }), {
      target: { value: 'Peruvian' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add cuisine' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save tags and time' }))

    await waitFor(() => expect(seedRecipe(1).cuisine).toBe('Peruvian'))
    expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).toContain('Peruvian')

    // Removing it is one tap on the selected chip, and saving that clears the tag.
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Cuisine' })).getByRole('button', {
        name: 'Remove the Peruvian cuisine',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save tags and time' }))
    await waitFor(() => expect(seedRecipe(1).cuisine).toBeUndefined())
    expect(screen.getByRole('group', { name: 'Chicken Curry tags' }).textContent).not.toContain('Peruvian')
  })

  it('offers cuisines the household already uses as one-tap chips', async () => {
    renderRoute(3) // Salmon Traybake has no cuisine of its own.
    await screen.findByRole('heading', { name: 'Salmon Traybake' })

    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    const cuisineGroup = screen.getByRole('group', { name: 'Cuisine' })
    // Suggested cuisines come first; English (used by two recipes) follows.
    const names = within(cuisineGroup)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(names.slice(0, 7)).toEqual(['Italian', 'Indian', 'Chinese', 'Thai', 'Mexican', 'English', 'Korean'])
    expect(names).not.toContain('Indian ')
  })
})

describe('RecipeDetailRoute photo upload', () => {
  it('previews and replaces an existing recipe photo', async () => {
    renderRoute(1)
    expect(await screen.findByRole('heading', { name: 'Chicken Curry' })).toBeTruthy()

    const photo = new File(['replacement image bytes'], 'new-photo.webp', { type: 'image/webp' })
    fireEvent.change(screen.getByLabelText('Choose recipe photo'), { target: { files: [photo] } })
    expect(screen.getByText(/(?:Selected|Previewing) new-photo\.webp/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }))

    await waitFor(() => expect(seedRecipe(1).image_filename).toMatch(/^v_[a-f0-9]{32}$/))
    const displayedImage = screen.getByRole('img', { name: 'Chicken Curry' }) as HTMLImageElement
    expect(displayedImage.src).toContain(`v=${seedRecipe(1).image_filename}`)
    expect(screen.queryByRole('button', { name: 'Upload photo' })).toBeNull()
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
    fireEvent.click(await within(editor).findByRole('button', { name: 'Add Blueberries to recipe' }))
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

describe('RecipeDailyServingHint', () => {
  it('uses the selected day’s remaining goal and includes logged drink calories', async () => {
    const recipe = seedRecipe(1)
    const drinkCalories = seed.drinkEntriesFor(seed.TODAY).reduce((total, entry) => total + entry.calories, 0)
    const remaining = seed.user.daily_calorie_goal - seed.totalsFor(seed.TODAY).calories - drinkCalories
    const expectedGrams = Math.floor(
      Math.min(recipe.total_weight_grams, (remaining * 100) / recipe.calories_per_100g),
    )

    renderRoute()

    const hint = await screen.findByTestId('recipe-daily-serving-hint')
    await waitFor(() => expect(hint.textContent).toContain(`up to ${formatGrams(expectedGrams)}`))
    expect(hint.textContent).toContain(`Based on ${formatNumber(remaining)} kcal left`)
    expect(hint.textContent).toContain('including food and drinks')
  })

  it('recalculates when the portion sheet date changes', async () => {
    const recipe = seedRecipe(1)
    const yesterday = addDays(seed.TODAY, -1)
    const drinkCalories = seed.drinkEntriesFor(yesterday).reduce((total, entry) => total + entry.calories, 0)
    // Seeded past-day totals vary with the calendar. Guarantee a positive
    // allowance for this date-change test rather than expecting negative grams.
    seed.user.daily_calorie_goal = seed.totalsFor(yesterday).calories + drinkCalories + 500
    const remaining = seed.user.daily_calorie_goal - seed.totalsFor(yesterday).calories - drinkCalories
    const expectedGrams = Math.floor(
      Math.min(recipe.total_weight_grams, (remaining * 100) / recipe.calories_per_100g),
    )

    renderRoute()
    fireEvent.click(await screen.findByRole('button', { name: /Add to diary/ }))
    const sheet = screen.getByRole('dialog')
    const hint = await within(sheet).findByTestId('recipe-daily-serving-hint')

    fireEvent.change(within(sheet).getByLabelText('Day'), { target: { value: yesterday } })
    await waitFor(() => {
      expect(hint.textContent).toContain(`up to ${formatGrams(expectedGrams)}`)
      expect(hint.textContent).toContain(`Based on ${formatNumber(remaining)} kcal left`)
      expect(hint.textContent).toContain('daily calorie goal yesterday')
    })
  })

  it('uses the full daily goal for a selected future date', async () => {
    const recipe = seedRecipe(1)
    const tomorrow = seed.nextDate(seed.TODAY)
    const expectedGrams = Math.floor(
      Math.min(
        recipe.total_weight_grams,
        (seed.user.daily_calorie_goal * 100) / recipe.calories_per_100g,
      ),
    )

    renderRoute()
    fireEvent.click(await screen.findByRole('button', { name: /Add to diary/ }))
    const sheet = screen.getByRole('dialog')
    const hint = await within(sheet).findByTestId('recipe-daily-serving-hint')

    fireEvent.change(within(sheet).getByLabelText('Day'), { target: { value: tomorrow } })
    await waitFor(() => {
      expect(hint.textContent).toContain(`up to ${formatGrams(expectedGrams)}`)
      expect(hint.textContent).toContain(`Based on ${formatNumber(seed.user.daily_calorie_goal)} kcal left`)
      expect(hint.textContent).toContain('daily calorie goal tomorrow')
    })
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


describe('Recipe calorie target calculator', () => {
  it('calculates in Edit recipe without saving changes or rewriting diary history', async () => {
    const original = JSON.stringify(seedRecipe(1))
    const history = JSON.stringify(seed.entriesFor(seed.TODAY))
    renderRoute()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit recipe' }))
    const sheet = screen.getByRole('dialog')
    const calculator = within(sheet).getByRole('complementary', { name: 'Calorie target calculator' })
    const input = within(calculator).getByLabelText('Calories to spend')
    expect(calculator.textContent).toContain('Based on the saved recipe')
    fireEvent.change(input, { target: { value: '375' } })
    const grams = 375 / seedRecipe(1).calories_per_100g * 100
    expect(calculator.textContent).toContain(`375 kcal ≈ ${formatGrams(grams)}`)
    fireEvent.change(input, { target: { value: '-1' } })
    expect(calculator.textContent).toContain('greater than zero')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(JSON.stringify(seedRecipe(1))).toBe(original)
    expect(JSON.stringify(seed.entriesFor(seed.TODAY))).toBe(history)
  })

  it('leaves fractions, grams, usual portion and the logged nutrition snapshot unchanged', async () => {
    renderRoute()
    const recipe = seedRecipe(1)
    const existingIds = new Set(seed.entriesFor(seed.TODAY).map((entry) => entry.id))
    fireEvent.click(await screen.findByRole('button', { name: /Add to diary/ }))
    const sheet = screen.getByRole('dialog')
    const calculator = within(sheet).getByRole('complementary', { name: 'Calorie target calculator' })
    const input = within(calculator).getByLabelText('Calories to spend')
    const weight = within(sheet).getByLabelText('Weight (grams)') as HTMLInputElement
    fireEvent.change(input, { target: { value: '375' } })
    expect(weight.value).toBe('')
    expect((within(sheet).getByRole('button', { name: 'Add to diary' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(sheet).getByRole('button', { name: /½/ }))
    const half = fractionGrams(recipe.total_weight_grams, 0.5) as number
    fireEvent.change(input, { target: { value: '150' } })
    expect(weight.value).toBe(String(half))
    fireEvent.change(input, { target: { value: '' } })
    expect(calculator.textContent).toContain('Enter a calorie target')
    expect(calculator.textContent).not.toContain('≈')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add to diary' }))
    await within(sheet).findByRole('status')
    const logged = seed.entriesFor(seed.TODAY).find((entry) => !existingIds.has(entry.id))
    expect(logged?.quantity_grams).toBe(half)
    expect(logged?.calories).toBeCloseTo(recipe.calories_per_100g * half / 100)
    expect(seed.usualGramsFor(1)).toBe(half)
  })
})
