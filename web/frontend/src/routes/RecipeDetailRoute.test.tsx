// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { handle } from '../../mock-api/handler.mjs'
import { resetFixtures } from '../../mock-api/seed.mjs'
import { RecipeDetailRoute } from './RecipeDetailRoute'

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/recipes/1']}>
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
    return new Response(typeof result.body === 'string' ? result.body : JSON.stringify(result.body), {
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
