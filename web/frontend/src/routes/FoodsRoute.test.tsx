// @vitest-environment jsdom
/**
 * Behavioural tests for the Foods screen: creating a food with named
 * gram-backed measures, editing it, and deleting it. These drive the fixture
 * API, which mirrors the Go handlers' validation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { FoodsRoute } from './FoodsRoute'

function renderFoods() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/foods']}>
        <Routes>
          <Route path="/foods" element={<FoodsRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  seed.resetFixtures()
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

describe('FoodsRoute', () => {
  it('creates a custom food with named measures that the diary can then offer', async () => {
    renderFoods()

    fireEvent.click(await screen.findByRole('button', { name: '+ New food' }))
    const modal = screen.getByRole('dialog')

    fireEvent.change(within(modal).getByLabelText('Name *'), { target: { value: 'Hoops' } })
    fireEvent.change(within(modal).getByLabelText('Calories *'), { target: { value: '380' } })
    fireEvent.change(within(modal).getByLabelText('Name', { selector: 'input' }), {
      target: { value: '1 bag' },
    })
    fireEvent.change(within(modal).getByLabelText('Grams'), { target: { value: '25' } })

    fireEvent.click(within(modal).getByRole('button', { name: '+ Add measure' }))
    const names = within(modal).getAllByLabelText('Name', { selector: 'input' })
    const grams = within(modal).getAllByLabelText('Grams')
    fireEvent.change(names[names.length - 1], { target: { value: '1 slice' } })
    fireEvent.change(grams[grams.length - 1], { target: { value: '12.5' } })

    fireEvent.click(within(modal).getByRole('button', { name: 'Create food' }))

    await waitFor(() => {
      const created = seed.foods.find((food) => food.name === 'Hoops')
      expect(created).toBeTruthy()
      expect(created?.serving_name).toBe('1 bag')
      expect(created?.serving_grams).toBe(25)
      // The preferred serving lives in its own fields; the extra measures are
      // the additional rows. The quantity picker merges the two.
      expect(created?.servings.map((serving) => [serving.description, serving.grams])).toEqual([
        ['1 slice', 12.5],
      ])
    })

    // The new food is in My foods, with both of its measures summarised.
    expect(await screen.findByText('Hoops')).toBeTruthy()
    const row = screen.getByText('Hoops').closest('li') as HTMLElement
    expect(row.textContent).toContain('1 bag (25.0 g)')
    expect(row.textContent).toContain('1 slice (12.5 g)')
  })

  it('refuses an incomplete measure instead of inventing a conversion', async () => {
    renderFoods()

    fireEvent.click(await screen.findByRole('button', { name: '+ New food' }))
    const modal = screen.getByRole('dialog')

    fireEvent.change(within(modal).getByLabelText('Name *'), { target: { value: 'Hoops' } })
    fireEvent.change(within(modal).getByLabelText('Calories *'), { target: { value: '380' } })
    fireEvent.change(within(modal).getByLabelText('Name', { selector: 'input' }), {
      target: { value: '1 bag' },
    })
    fireEvent.click(within(modal).getByRole('button', { name: 'Create food' }))

    expect(
      await within(modal).findByText('The preferred serving needs a weight in grams greater than zero.'),
    ).toBeTruthy()
    expect(seed.foods.some((food) => food.name === 'Hoops')).toBe(false)
  })

  it('edits a custom food’s measures and deletes it once asked', async () => {
    renderFoods()

    const seeded = seed.foods.find((food) => food.name === 'Banana')!
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Banana' }))
    const modal = screen.getByRole('dialog')

    // The seeded preferred serving is loaded, and its measures are editable.
    const servingName = within(modal).getAllByLabelText('Name', { selector: 'input' })[0]
    expect((servingName as HTMLInputElement).value).toBe(seeded.serving_name)
    fireEvent.change(servingName, { target: { value: '1 small' } })
    fireEvent.change(within(modal).getAllByLabelText('Grams')[0], { target: { value: '90' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Save food' }))

    await waitFor(() => {
      const updated = seed.foods.find((food) => food.name === 'Banana')
      expect(updated?.serving_name).toBe('1 small')
      expect(updated?.serving_grams).toBe(90)
    })

    // Delete: only custom foods offer it, and the row goes away.
    fireEvent.click(screen.getByRole('button', { name: 'Delete Banana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(seed.foods.some((food) => food.name === 'Banana')).toBe(false))
    await waitFor(() => expect(screen.queryByText('Banana')).toBeNull())
  })
})
