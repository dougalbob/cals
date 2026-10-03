// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { DrinksRoute } from './DrinksRoute'

function renderDrinks() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/drinks']}>
        <Routes>
          <Route path="/drinks" element={<DrinksRoute />} />
          <Route path="/" element={<div>today</div>} />
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

describe('DrinksRoute', () => {
  it('shows the catalog with the everyday four first and the current glass size', async () => {
    renderDrinks()
    expect(await screen.findByText('My drinks')).toBeTruthy()
    expect(screen.getByLabelText('Decrease glass size')).toBeTruthy()
    expect(screen.getByRole('button', { pressed: true, name: '250' })).toBeTruthy()

    const add = screen.getByText('Add a drink').closest('section') as HTMLElement
    const names = within(add)
      .getAllByRole('button')
      .map((btn) => (btn.textContent ?? '').replace(/\s+/g, ''))
    expect(names.slice(0, 4)).toEqual(['☕Coffee', '🫖Tea', '🥛Milk', '🧃Juice'])
  })

  it('adds a catalog drink to Today', async () => {
    renderDrinks()
    await screen.findByText('My drinks')
    fireEvent.click(screen.getByRole('button', { name: /Hot chocolate/ }))
    await waitFor(() => expect(seed.drinks.some((d) => d.name === 'Hot chocolate')).toBe(true))
    expect(await screen.findByRole('dialog', { name: /hot chocolate/i })).toBeTruthy()
  })
})
