// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { handle } from '../../mock-api/handler.mjs'
import { favouriteRecipeIds, recipes as seedRecipes, resetFixtures } from '../../mock-api/seed.mjs'
import { RecipeDetailRoute } from './RecipeDetailRoute'
import { RecipesRoute } from './RecipesRoute'

/** Reads the fixture's archive flag back, to prove the UI really called the API. */
function seedRecipeArchived(id: number) {
  return seedRecipes.find((recipe) => recipe.id === id)?.is_archived
}

/** Lets the tests assert that the tag filter really is in the URL. */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location-search">{location.search}</span>
}

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/recipes']}>
        <Routes>
          <Route path="/recipes" element={<RecipesRoute />} />
          <Route path="/recipes/:id" element={<RecipeDetailRoute />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const search = () =>
  decodeURIComponent(screen.getByTestId('location-search').textContent ?? '')

/** The tag row for one card, so a tag shared by several recipes is unambiguous. */
function tagRow(recipeName: string) {
  return within(screen.getByRole('group', { name: `${recipeName} tags` }))
}

beforeEach(() => {
  resetFixtures()
  favouriteRecipeIds.clear()
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
  favouriteRecipeIds.clear()
  vi.unstubAllGlobals()
})

describe('RecipesRoute', () => {
  it('lists recipe cards, searches them and filters to per-user favourites', async () => {
    renderRoute()

    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeTruthy()
    expect(screen.getByText('Chicken Curry')).toBeTruthy()
    expect(screen.getByText('Porridge & Berries')).toBeTruthy()
    expect(screen.getByText('Salmon Traybake')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: 'salmon' },
    })
    expect(screen.getByText('Salmon Traybake')).toBeTruthy()
    expect(screen.queryByText('Chicken Curry')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Chicken Curry to favourites' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove Chicken Curry from favourites' }).getAttribute('aria-pressed')).toBe('true')
    })
    expect(favouriteRecipeIds.has(1)).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show favourites only' }))
    expect(screen.getByText('Chicken Curry')).toBeTruthy()
    expect(screen.queryByText('Porridge & Berries')).toBeNull()
    expect(screen.queryByText('Salmon Traybake')).toBeNull()
  })

  it('opens a recipe detail page from a catalogue card', async () => {
    renderRoute()

    fireEvent.click(await screen.findByRole('link', { name: 'View Chicken Curry' }))
    expect(await screen.findByRole('heading', { name: 'Ingredients' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Chicken Curry' })).toBeTruthy()
  })

  it('filters by separate meal occasion, dish type and known key foods', async () => {
    renderRoute()

    await screen.findByRole('heading', { name: 'Recipes' })
    fireEvent.click(screen.getByText('Filter by occasion, dish type or key food'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by meal occasion' }), {
      target: { value: 'dinner' },
    })
    expect(screen.getByText('Chicken Curry')).toBeTruthy()
    expect(screen.getByText('Salmon Traybake')).toBeTruthy()
    expect(screen.queryByText('Porridge & Berries')).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by dish type' }), {
      target: { value: 'main' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by key food' }), {
      target: { value: '11' },
    })
    expect(screen.getByText('Salmon Traybake')).toBeTruthy()
    expect(screen.queryByText('Chicken Curry')).toBeNull()
  })

  it('narrows the list when a tag is tapped, and narrows again with a second tag', async () => {
    renderRoute()

    expect(await screen.findByText('Porridge & Berries')).toBeTruthy()
    expect(screen.getByText('4 recipes')).toBeTruthy()

    fireEvent.click(
      tagRow('Chicken & Mushroom Pie').getByRole('button', {
        name: 'Filter recipes by Chicken Breast, grilled',
      }),
    )

    // Both chicken recipes remain; everything else is filtered out.
    expect(screen.getByText('Chicken & Mushroom Pie')).toBeTruthy()
    expect(screen.getByText('Chicken Curry')).toBeTruthy()
    expect(screen.queryByText('Porridge & Berries')).toBeNull()
    expect(screen.queryByText('Salmon Traybake')).toBeNull()
    expect(screen.getByText('2 of 4 recipes match')).toBeTruthy()
    expect(search()).toBe('?tags=food:5')

    // ...and a second tap on the pie's Mushroom tag narrows it to the recipes with both.
    fireEvent.click(
      tagRow('Chicken & Mushroom Pie').getByRole('button', {
        name: 'Filter recipes by Mushrooms, sliced',
      }),
    )

    expect(screen.getByText('Chicken & Mushroom Pie')).toBeTruthy()
    expect(screen.queryByText('Chicken Curry')).toBeNull()
    expect(screen.getByText('1 of 4 recipes match')).toBeTruthy()
    expect(search()).toBe('?tags=food:5,food:25')
  })

  it('shows the active tags, lets one be removed and clears them all', async () => {
    renderRoute()

    await screen.findByText('Porridge & Berries')
    fireEvent.click(
      tagRow('Chicken Curry').getByRole('button', {
        name: 'Filter recipes by Basmati Rice, cooked',
      }),
    )
    fireEvent.click(
      tagRow('Chicken Curry').getByRole('button', {
        name: 'Filter recipes by Chicken Breast, grilled',
      }),
    )
    expect(search()).toBe('?tags=food:9,food:5')

    // The tapped tags are marked as active on the card as well as in the filter bar.
    expect(
      tagRow('Chicken Curry')
        .getByRole('button', { name: 'Stop filtering by Chicken Breast, grilled' })
        .getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Basmati Rice, cooked filter' }))
    expect(screen.getByText('Chicken & Mushroom Pie')).toBeTruthy()
    expect(screen.queryByText('Salmon Traybake')).toBeNull()
    expect(search()).toBe('?tags=food:5')

    fireEvent.click(screen.getByRole('button', { name: 'Clear tags' }))
    expect(screen.getByText('Porridge & Berries')).toBeTruthy()
    expect(screen.getByText('4 recipes')).toBeTruthy()
    expect(search()).toBe('')
  })

  it('removes a filter when its highlighted card tag is tapped again', async () => {
    renderRoute()

    await screen.findByText('Porridge & Berries')
    fireEvent.click(
      tagRow('Salmon Traybake').getByRole('button', {
        name: 'Filter recipes by Salmon Fillet, baked',
      }),
    )
    expect(screen.queryByText('Chicken Curry')).toBeNull()

    fireEvent.click(
      tagRow('Salmon Traybake').getByRole('button', {
        name: 'Stop filtering by Salmon Fillet, baked',
      }),
    )
    expect(screen.getByText('Chicken Curry')).toBeTruthy()
    expect(screen.getByText('4 recipes')).toBeTruthy()
  })

  it('keeps the facet dropdowns in step with tapped tags, and vice versa', async () => {
    renderRoute()

    await screen.findByText('Porridge & Berries')
    fireEvent.click(
      tagRow('Chicken Curry').getByRole('button', {
        name: 'Filter recipes by Dinner',
      }),
    )
    const occasionSelect = screen.getByRole('combobox', { name: 'Filter by meal occasion' }) as HTMLSelectElement
    expect(occasionSelect.value).toBe('dinner')

    const foodSelect = screen.getByRole('combobox', { name: 'Filter by key food' }) as HTMLSelectElement
    fireEvent.change(foodSelect, { target: { value: '5' } })
    // Choosing from the dropdown replaces that facet's tapped tags, so the two
    // controls never disagree about what is being filtered.
    expect(search()).toBe('?tags=occasion:dinner,food:5')
    expect(screen.getByText('Chicken & Mushroom Pie')).toBeTruthy()
    expect(screen.queryByText('Salmon Traybake')).toBeNull()

    expect(screen.getByRole('button', { name: 'Remove Dinner filter' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Chicken Breast, grilled filter' })).toBeTruthy()
  })

  it('carries the filter into a recipe detail page and back to the same list', async () => {
    renderRoute()

    await screen.findByText('Porridge & Berries')
    fireEvent.click(
      tagRow('Chicken & Mushroom Pie').getByRole('button', {
        name: 'Filter recipes by Chicken Breast, grilled',
      }),
    )
    fireEvent.click(screen.getByRole('link', { name: 'View Chicken & Mushroom Pie' }))

    expect(await screen.findByRole('heading', { name: 'Ingredients' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: /Back to recipes/ }))

    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeTruthy()
    expect(await screen.findByText('2 of 4 recipes match')).toBeTruthy()
    expect(screen.queryByText('Porridge & Berries')).toBeNull()
  })

  it('starts a tag filter from a recipe detail page', async () => {
    renderRoute()

    fireEvent.click(await screen.findByRole('link', { name: 'View Chicken & Mushroom Pie' }))
    await screen.findByRole('heading', { name: 'Ingredients' })
    fireEvent.click(
      tagRow('Chicken & Mushroom Pie').getByRole('link', {
        name: 'Show recipes tagged Mushrooms, sliced',
      }),
    )

    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeTruthy()
    expect(await screen.findByText('1 of 4 recipes match')).toBeTruthy()
    expect(screen.getByText('Chicken & Mushroom Pie')).toBeTruthy()
    expect(screen.queryByText('Chicken Curry')).toBeNull()
    expect(search()).toBe('?tags=food:25')
  })

  it('offers a way out when the selected tags match nothing', async () => {
    renderRoute()

    await screen.findByText('Porridge & Berries')
    // Tapping a tag and then choosing a different facet cannot intersect:
    // no dinner recipe uses Porridge Oats.
    fireEvent.click(
      tagRow('Porridge & Berries').getByRole('button', {
        name: 'Filter recipes by Porridge Oats',
      }),
    )
    expect(screen.getByText('1 of 4 recipes match')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by meal occasion' }), {
      target: { value: 'dinner' },
    })

    expect(screen.getByText('0 of 4 recipes match')).toBeTruthy()
    expect(screen.getByText('No recipes match these filters.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear tags' }))
    expect(screen.getByText('Porridge & Berries')).toBeTruthy()
  })

  it('can remove a recipe from favourites again', async () => {
    renderRoute()

    const addButton = await screen.findByRole('button', { name: 'Add Porridge & Berries to favourites' })
    fireEvent.click(addButton)
    const removeButton = await screen.findByRole('button', {
      name: 'Remove Porridge & Berries from favourites',
    })
    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Porridge & Berries to favourites' }).getAttribute('aria-pressed')).toBe('false')
    })
    expect(favouriteRecipeIds.has(2)).toBe(false)
  })

  it('hides archived recipes until "Show archived" is on, then offers Restore on the card', async () => {
    // Archive one recipe through the fixture endpoint, as the detail page does.
    expect(handle('PUT', new URL('/api/recipes/3/archive', 'http://localhost'), { is_archived: true })?.status).toBe(200)
    renderRoute()

    // Hidden by default: not in the list, and the toggle counts it.
    expect(await screen.findByText('Chicken Curry')).toBeTruthy()
    expect(screen.queryByText('Salmon Traybake')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore Salmon Traybake' })).toBeNull()
    const toggle = screen.getByRole('checkbox', { name: 'Show archived (1)' }) as HTMLInputElement
    expect(toggle.disabled).toBe(false)
    expect(toggle.checked).toBe(false)

    fireEvent.click(toggle)
    const archivedSection = await screen.findByRole('region', { name: /Archived recipes \(1\)/ })
    expect(within(archivedSection).getByText('Salmon Traybake')).toBeTruthy()
    // An archived card cannot be favourited, and offers Restore instead.
    expect(within(archivedSection).queryByRole('button', { name: /favourites/ })).toBeNull()

    fireEvent.click(within(archivedSection).getByRole('button', { name: 'Restore Salmon Traybake' }))
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /Archived recipes/ })).toBeNull()
    })
    expect(await screen.findByText('Salmon Traybake')).toBeTruthy()
    expect(seedRecipeArchived(3)).toBe(false)
  })

  it('disables the archived toggle when nothing is archived', async () => {
    renderRoute()
    const toggle = (await screen.findByRole('checkbox', { name: 'Show archived (0)' })) as HTMLInputElement
    expect(toggle.disabled).toBe(true)
  })

  it('explains an all-archived catalogue instead of saying there are no recipes', async () => {
    for (const id of [1, 2, 3, 4]) {
      handle('PUT', new URL(`/api/recipes/${id}/archive`, 'http://localhost'), { is_archived: true })
    }
    renderRoute()
    expect(await screen.findByText(/All your recipes are archived/)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show archived (4)' }))
    expect(await screen.findByRole('region', { name: /Archived recipes \(4\)/ })).toBeTruthy()
  })

  it('applies search and tag filters to archived recipes too', async () => {
    handle('PUT', new URL('/api/recipes/3/archive', 'http://localhost'), { is_archived: true })
    renderRoute()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Show archived (1)' }))
    await screen.findByRole('region', { name: /Archived recipes/ })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: 'porridge' },
    })
    expect(screen.queryByRole('region', { name: /Archived recipes/ })).toBeNull()
    expect(screen.getByText('Porridge & Berries')).toBeTruthy()
  })
})
