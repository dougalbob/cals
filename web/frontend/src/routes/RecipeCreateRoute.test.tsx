// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { handle } from '../../mock-api/handler.mjs'
import { recipes, resetFixtures } from '../../mock-api/seed.mjs'
import { RecipeCreateRoute } from './RecipeCreateRoute'
import { RecipeDetailRoute } from './RecipeDetailRoute'
import { RecipesRoute } from './RecipesRoute'

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location-href">{`${location.pathname}${location.search}${location.hash}`}</span>
}

function renderRoute(path = '/recipes/new') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipes" element={<RecipesRoute />} />
          <Route path="/recipes/new" element={<RecipeCreateRoute />} />
          <Route path="/recipes/:id" element={<RecipeDetailRoute />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const href = () => screen.getByTestId('location-href').textContent ?? ''

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

describe('RecipeCreateRoute', () => {
  it('authors a recipe with Food ingredients, cooked yield and shared tags', async () => {
    renderRoute('/recipes?tags=origin:own')

    fireEvent.click(await screen.findByRole('link', { name: 'Create recipe' }))
    expect(await screen.findByRole('heading', { name: 'Create a recipe' })).toBeTruthy()
    expect(href()).toBe('/recipes/new?tags=origin%3Aown')
    const form = screen.getByRole('region', { name: 'New recipe details' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Recipe name' }), {
      target: { value: 'Weeknight chicken bowl' },
    })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Description' }), {
      target: { value: 'A simple, filling dinner.' },
    })
    fireEvent.change(within(form).getByRole('searchbox', { name: 'Search cals Foods to add' }), {
      target: { value: 'Chicken Breast' },
    })
    fireEvent.click(await within(form).findByRole('button', { name: 'Add Chicken Breast, grilled to recipe' }))

    fireEvent.change(within(form).getByRole('spinbutton', {
      name: 'Chicken Breast, grilled weight (grams) 1',
    }), { target: { value: '250' } })
    fireEvent.click(within(form).getByRole('checkbox', { name: 'I measured the cooked weight' }))
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Cooked weight (grams)' }), {
      target: { value: '200' },
    })
    expect(within(form).getByRole('region', { name: 'Nutrition estimate' }).textContent).toContain('412.5 kcal total')
    expect(within(form).getByRole('region', { name: 'Nutrition estimate' }).textContent).toContain('206.3 kcal / 100 g cooked')

    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Serves' }), {
      target: { value: '3' },
    })
    fireEvent.click(within(form).getByRole('button', { name: '+ Add text ingredient' }))
    fireEvent.change(within(form).getByRole('textbox', { name: 'Text ingredient 1' }), {
      target: { value: 'A squeeze of lemon' },
    })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Method / instructions' }), {
      target: { value: 'Cook the chicken, then serve with rice.' },
    })

    fireEvent.click(within(form).getByRole('checkbox', { name: 'Dinner' }))
    fireEvent.change(within(form).getByRole('combobox', { name: 'Dish type' }), {
      target: { value: 'main' },
    })
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Own creation' }))
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Chicken Breast, grilled' }))
    fireEvent.change(within(form).getByRole('spinbutton', {
      name: 'Total prep-to-plate time (minutes)',
    }), { target: { value: '40' } })

    fireEvent.click(within(form).getByRole('button', { name: 'Create recipe' }))

    expect(await screen.findByRole('heading', { name: 'Weeknight chicken bowl' })).toBeTruthy()
    const created = recipes.find((recipe) => recipe.name === 'Weeknight chicken bowl')
    expect(created).toBeTruthy()
    expect(created).toMatchObject({
      description: 'A simple, filling dinner.',
      instructions: 'Cook the chicken, then serve with rice.',
      serves: 3,
      total_weight_grams: 200,
      calculated_weight_grams: 250,
      weight_is_manual: true,
      total_calories: 412.5,
      is_own_creation: true,
      meal_occasions: ['dinner'],
      dish_type: 'main',
      total_time_minutes: 40,
      image_filename: '',
    })
    expect(created?.ingredients).toHaveLength(1)
    expect(created?.text_ingredients.map((ingredient) => ingredient.description)).toEqual(['A squeeze of lemon'])
    expect(created?.key_foods).toEqual([{ food_id: 5, food_name: 'Chicken Breast, grilled' }])
    expect(href()).toBe(`/recipes/${created?.id}?tags=origin%3Aown`)

    const tags = screen.getByRole('group', { name: 'Weeknight chicken bowl tags' })
    expect(within(tags).getByRole('link', { name: 'Show recipes tagged Own creation' })).toBeTruthy()
    expect(within(tags).getByRole('link', { name: 'Show recipes tagged Dinner' })).toBeTruthy()
    expect(within(tags).getByRole('link', { name: 'Show recipes tagged Main' })).toBeTruthy()
  })

  it('uploads a selected photo after creating the recipe and displays its versioned image', async () => {
    renderRoute()
    const form = await screen.findByRole('region', { name: 'New recipe details' })

    fireEvent.change(within(form).getByRole('textbox', { name: 'Recipe name' }), {
      target: { value: 'Photo-only recipe' },
    })
    const photo = new File(['fixture image bytes'], 'photo.png', { type: 'image/png' })
    fireEvent.change(within(form).getByLabelText('Choose recipe photo'), { target: { files: [photo] } })
    expect(within(form).getByText(/(?:Selected|Previewing) photo\.png/)).toBeTruthy()

    fireEvent.click(within(form).getByRole('button', { name: 'Create recipe' }))

    expect(await screen.findByRole('heading', { name: 'Photo-only recipe' })).toBeTruthy()
    const created = recipes.find((recipe) => recipe.name === 'Photo-only recipe')
    expect(created?.image_filename).toMatch(/^v_[a-f0-9]{32}$/)
    expect(await screen.findByRole('img', { name: 'Photo-only recipe' })).toBeTruthy()
  })

  it('does not suggest duplicate creation when photo upload fails after the recipe is saved', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname.endsWith('/image')) {
        return new Response(JSON.stringify({ error: 'temporary upload failure' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    })

    renderRoute()
    const form = await screen.findByRole('region', { name: 'New recipe details' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Recipe name' }), {
      target: { value: 'Saved without photo' },
    })
    const photo = new File(['fixture image bytes'], 'photo.png', { type: 'image/png' })
    fireEvent.change(within(form).getByLabelText('Choose recipe photo'), { target: { files: [photo] } })
    fireEvent.click(within(form).getByRole('button', { name: 'Create recipe' }))

    expect(await screen.findByRole('heading', { name: 'Saved without photo' })).toBeTruthy()
    const created = recipes.find((recipe) => recipe.name === 'Saved without photo')
    expect(created).toBeTruthy()
    expect(created?.image_filename).toBe('')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Photo upload failed')
    expect(alert.textContent).toContain('already saved')
    expect(alert.textContent).toContain('don\'t create another recipe')
    expect(screen.getByLabelText('Choose recipe photo')).toBeTruthy()
  })

  it('returns to the same filtered catalogue when creation is cancelled', async () => {
    renderRoute('/recipes?tags=food:5')
    fireEvent.click(await screen.findByRole('link', { name: 'Create recipe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(href()).toBe('/recipes?tags=food%3A5'))
    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeTruthy()
  })

  it('keeps an empty or invalid form from reaching the API', async () => {
    renderRoute()
    const form = await screen.findByRole('region', { name: 'New recipe details' })
    fireEvent.click(within(form).getByRole('button', { name: 'Create recipe' }))
    expect((await within(form).findByRole('alert')).textContent).toContain('Recipe name is required.')
    expect(recipes).toHaveLength(4)

    fireEvent.change(within(form).getByRole('textbox', { name: 'Recipe name' }), {
      target: { value: 'Invalid time' },
    })
    fireEvent.change(within(form).getByRole('spinbutton', {
      name: 'Total prep-to-plate time (minutes)',
    }), { target: { value: '0' } })
    fireEvent.submit(form.querySelector('form') as HTMLFormElement)
    expect((await within(form).findByRole('alert')).textContent).toContain(
      'Total time must be a whole number of minutes greater than zero.',
    )
    expect(recipes).toHaveLength(4)
  })
})
