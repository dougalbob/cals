// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { handle } from '../../mock-api/handler.mjs'
import { favouriteRecipeIds } from '../../mock-api/seed.mjs'
import { RecipeDetailRoute } from './RecipeDetailRoute'
import { RecipesRoute } from './RecipesRoute'

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
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  favouriteRecipeIds.clear()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const result = handle(
      init?.method ?? 'GET',
      url,
      init?.body ? JSON.parse(String(init.body)) : null,
    )
    if (!result) return new Response('not found', { status: 404 })
    return new Response(typeof result.body === 'string' ? result.body : JSON.stringify(result.body), {
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
})
