// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { addDays } from '../lib/format'
import { handle } from '../../mock-api/handler.mjs'
import { favouriteRecipeIds, recipes as seedRecipes, resetFixtures } from '../../mock-api/seed.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { RecipeDetailRoute } from './RecipeDetailRoute'
import { RecipesRoute } from './RecipesRoute'

/** Reads the fixture's archive flag back, to prove the UI really called the API. */
function seedRecipeArchived(id: number) {
  return seedRecipes.find((recipe) => recipe.id === id)?.is_archived
}

/** Lets the tests assert that the tag filter really is in the URL. */
function LocationProbe() {
  const location = useLocation()
  return (
    <>
      <span data-testid="location-search">{location.search}</span>
      <span data-testid="location-href">
        {`${location.pathname}${location.search}${location.hash}`}
      </span>
    </>
  )
}

function renderRoute(path = '/recipes') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipes" element={<RecipesRoute />} />
          <Route path="/recipes/:id" element={<RecipeDetailRoute />} />
          <Route path="/diary/:date" element={<p>diary for date</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const href = () => screen.getByTestId('location-href').textContent ?? ''

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
    const favouriteButton = screen.getByRole('button', { name: 'Add Chicken Curry to favourites' })
    expect(favouriteButton.className).toContain('h-[66px] w-[66px]')
    expect(favouriteButton.className).toContain('bg-transparent')
    const favouriteBadge = favouriteButton.querySelector<HTMLElement>('[data-favourite-badge]')
    expect(favouriteBadge?.className).toContain('h-[33px] w-[33px]')
    expect(favouriteButton.querySelector('svg')?.getAttribute('class')).toContain('h-[18px] w-[18px]')

    fireEvent.click(favouriteButton)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove Chicken Curry from favourites' }).getAttribute('aria-pressed')).toBe('true')
    })
    expect(favouriteRecipeIds.has(1)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }))
    expect(screen.getByText('Chicken Curry')).toBeTruthy()
    expect(screen.queryByText('Porridge & Berries')).toBeNull()
    expect(screen.queryByText('Salmon Traybake')).toBeNull()
  })

  it('shows each signed-in user\'s recipe log count in a blue, three-digit badge and omits zero', async () => {
    const curryCount = seed.diaryEntries.filter(
      (entry) => entry.recipe_id === 1 && entry.user_id === seed.user.id,
    ).length
    expect(curryCount).toBeGreaterThan(0)

    renderRoute()

    const badge = await screen.findByRole('img', { name: `Logged ${curryCount} times` })
    expect(badge.textContent).toBe(String(curryCount))
    expect(badge.className).toContain('left-3 top-3')
    expect(badge.className).toContain('rounded-full')
    expect(badge.className).toContain('bg-primary')
    expect(badge.className).toContain('text-white')
    expect(badge.className).toContain('h-9 w-9')
    expect(badge.className).toContain('text-xs')

    const neverLoggedLink = screen.getByRole('link', { name: 'View Porridge & Berries' })
    expect(neverLoggedLink.closest('article')?.querySelector('[data-recipe-log-count]')).toBeNull()
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
    fireEvent.click(screen.getByText('Filter by recipe details'))
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

  it('shows the own-creation tag in orange and filters by it like the other tags', async () => {
    renderRoute()

    expect(await screen.findByText('Chicken & Mushroom Pie')).toBeTruthy()
    const ownTag = tagRow('Chicken & Mushroom Pie').getByRole('button', {
      name: 'Filter recipes by Own creation',
    })
    expect(ownTag.className).toContain('bg-orange-200')
    fireEvent.click(ownTag)

    expect(tagRow('Chicken & Mushroom Pie').getByRole('button', {
      name: 'Stop filtering by Own creation',
    }).className).toContain('bg-orange-700')
    expect(screen.getByText('Chicken & Mushroom Pie')).toBeTruthy()
    expect(screen.queryByText('Chicken Curry')).toBeNull()
    expect(screen.queryByText('Porridge & Berries')).toBeNull()
    expect(screen.queryByText('Salmon Traybake')).toBeNull()
    expect(screen.getByText('1 of 4 recipes match')).toBeTruthy()
    expect(search()).toBe('?tags=origin:own')
    expect(screen.getByRole('button', { name: 'Remove Own creation filter' })).toBeTruthy()
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

  it('hides archived recipes until the Archived toggle is on, then offers Restore on the card', async () => {
    // Archive one recipe through the fixture endpoint, as the detail page does.
    expect(handle('PUT', new URL('/api/recipes/3/archive', 'http://localhost'), { is_archived: true })?.status).toBe(200)
    renderRoute()

    // Hidden by default: not in the list, and the toggle counts it.
    expect(await screen.findByText('Chicken Curry')).toBeTruthy()
    expect(screen.queryByText('Salmon Traybake')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore Salmon Traybake' })).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Archived' }) as HTMLButtonElement
    expect(toggle.disabled).toBe(false)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.getAttribute('title')).toBe('Show archived recipes (1)')
    // The Favourites and Archived toggles share one row.
    const row = screen.getByRole('group', { name: 'Recipe views' })
    expect(within(row).getByRole('button', { name: 'Favourites' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Archived' })).toBe(toggle)

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
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

  it('keeps the count in the top-left on archived cards and moves the Archived pill to the top-right', async () => {
    expect(handle('PUT', new URL('/api/recipes/1/archive', 'http://localhost'), { is_archived: true })?.status).toBe(200)
    renderRoute()

    const toggle = await screen.findByRole('button', { name: 'Archived' })
    fireEvent.click(toggle)
    const archivedSection = await screen.findByRole('region', { name: /Archived recipes \(1\)/ })
    const archivedCard = within(archivedSection).getByRole('article', { name: 'Chicken Curry (archived)' })
    const badge = within(archivedCard).getByRole('img', { name: /Logged 4 times/ })
    const archivedPill = within(archivedCard).getByText('Archived')

    expect(badge.className).toContain('left-3 top-3')
    expect(archivedPill.className).toContain('right-3 top-3')
    expect(archivedPill.className).not.toContain('left-3')
  })

  it('disables the archived toggle when nothing is archived', async () => {
    renderRoute()
    const toggle = (await screen.findByRole('button', { name: 'Archived' })) as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
  })

  it('explains an all-archived catalogue instead of saying there are no recipes', async () => {
    for (const id of [1, 2, 3, 4]) {
      handle('PUT', new URL(`/api/recipes/${id}/archive`, 'http://localhost'), { is_archived: true })
    }
    renderRoute()
    expect(await screen.findByText(/All your recipes are archived/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    expect(await screen.findByRole('region', { name: /Archived recipes \(4\)/ })).toBeTruthy()
  })

  it('applies search and tag filters to archived recipes too', async () => {
    handle('PUT', new URL('/api/recipes/3/archive', 'http://localhost'), { is_archived: true })
    renderRoute()
    fireEvent.click(await screen.findByRole('button', { name: 'Archived' }))
    await screen.findByRole('region', { name: /Archived recipes/ })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes' }), {
      target: { value: 'porridge' },
    })
    expect(screen.queryByRole('region', { name: /Archived recipes/ })).toBeNull()
    expect(screen.getByText('Porridge & Berries')).toBeTruthy()
  })

  describe('recipe-pick mode (started from a Diary meal card)', () => {
    const armed = (meal: string, date: string) => renderRoute(`/recipes?add-to=${meal}&on=${date}`)

    it('says which meal and day it is picking for, and keeps the search tools', async () => {
      armed('breakfast', seed.TODAY)

      const banner = await screen.findByRole('status', { name: 'Adding a recipe to the diary' })
      expect(banner.textContent).toContain('Pick a recipe for Breakfast')
      expect(banner.textContent).toContain('today')
      // The recipe box is unchanged apart from the banner: search and favourites still work.
      expect(screen.getByPlaceholderText('Search recipes…')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Favourites' })).toBeTruthy()
      // And leaving is one tap, back to the day and meal it started from.
      expect(within(banner).getByRole('link', { name: '← Back to the diary' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Cancel' })).toBeTruthy()
    })

    it('logs the portion to the carried meal and date, then returns to that day', async () => {
      const target = addDays(seed.TODAY, -3)
      const countBefore = seed.diaryEntries.filter(
        (entry) => entry.recipe_id === 1 && entry.user_id === seed.user.id,
      ).length
      armed('breakfast', target)

      const add = await screen.findByRole('button', {
        name: `Add Chicken Curry to Breakfast on ${target}`,
      })
      fireEvent.click(add)

      // The portion sheet is the same one as always, with the diary's answers in it.
      const sheet = await screen.findByRole('dialog', { name: 'Add Chicken Curry to Breakfast' })
      expect(within(sheet).getByText(/Going to Breakfast/)).toBeTruthy()
      const breakfast = within(sheet)
        .getAllByRole('button')
        .find((button) => button.getAttribute('aria-pressed') === 'true' && button.textContent?.includes('Breakfast'))
      expect(breakfast).toBeTruthy()
      expect((within(sheet).getByLabelText('Day') as HTMLInputElement).value).toBe(target)

      fireEvent.click(within(sheet).getByRole('button', { name: /½/ }))
      fireEvent.click(within(sheet).getByRole('button', { name: 'Add to diary' }))

      await waitFor(() => {
        const logged = seed.entriesFor(target).find((entry) => entry.recipe_id === 1)
        expect(logged).toMatchObject({ meal: 'breakfast' })
        expect(logged?.quantity_grams).toBeGreaterThan(0)
      })
      expect(
        await screen.findByRole('img', { name: `Logged ${countBefore + 1} times` }),
      ).toBeTruthy()
      // No archived-recipe or history surprises: the entry is on the asked-for day.
      expect(seed.entriesFor(seed.TODAY).some((entry) => entry.recipe_id === 1)).toBe(false)

      fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
      await waitFor(() => expect(href()).toBe(`/diary/${target}#breakfast`))
    })

    it('keeps the intent through a detour into the recipe itself', async () => {
      const target = addDays(seed.TODAY, -1)
      armed('lunch', target)

      fireEvent.click(await screen.findByRole('link', { name: 'View Chicken Curry' }))
      await screen.findByRole('heading', { name: 'Chicken Curry' })

      // The detail page is in the flow too: its add button names the meal, and
      // the back link returns to the filtered, still-armed list.
      const addButton = await screen.findByRole('button', { name: '🍽 Add to Lunch' })
      fireEvent.click(addButton)
      const sheet = await screen.findByRole('dialog', { name: 'Add Chicken Curry to Lunch' })
      expect((within(sheet).getByLabelText('Day') as HTMLInputElement).value).toBe(target)
      expect(screen.getByRole('link', { name: '← Back to recipes' }).getAttribute('href')).toBe(
        `/recipes?add-to=lunch&on=${target}`,
      )
    })

    it('adds nothing when the recipe box is not being used as a picker', async () => {
      renderRoute()
      await screen.findByRole('heading', { name: 'Recipes' })
      expect(screen.queryByRole('button', { name: /Add Chicken Curry to (Breakfast|Lunch|Dinner|Snacks)/ })).toBeNull()
      expect(screen.queryByRole('status', { name: 'Adding a recipe to the diary' })).toBeNull()
    })

    it('still refuses to log an archived recipe (decision 59)', async () => {
      handle('PUT', new URL('/api/recipes/3/archive', 'http://localhost'), { is_archived: true })
      armed('snacks', seed.TODAY)

      const add = await screen.findByRole('button', { name: /Add Chicken Curry to Breakfast|Add Chicken Curry to Snacks/ })
      expect(add).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
      const archived = await screen.findByRole('article', { name: 'Salmon Traybake (archived)' })
      // It can be restored, but it is never offered as the day's recipe.
      expect(within(archived).getByRole('button', { name: 'Restore Salmon Traybake' })).toBeTruthy()
      expect(within(archived).queryByRole('button', { name: /Add Salmon Traybake to/ })).toBeNull()
    })

    it('ignores a hand-edited or stale intent instead of guessing a meal', async () => {
      renderRoute('/recipes?add-to=supper')
      await screen.findByRole('heading', { name: 'Recipes' })
      expect(screen.queryByRole('status', { name: 'Adding a recipe to the diary' })).toBeNull()
      expect(screen.queryByRole('button', { name: /Add Chicken Curry to (Breakfast|Lunch|Dinner|Snacks)/ })).toBeNull()
    })
  })
})
