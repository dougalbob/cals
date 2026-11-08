// @vitest-environment jsdom
/**
 * Smoke tests for the Metrics and Foods screens.
 *
 * The Diary screen has its own behavioural test; these exist so that a broken
 * screen fails CI rather than only being noticed in the browser. They drive the
 * fixture API, so chart maths, date formatting and null handling are exercised
 * with the same data the preview shows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { MetricsRoute } from './MetricsRoute'
import { FoodsRoute } from './FoodsRoute'
import { formatStonesPounds } from '../lib/format'

function renderRoute(element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const result = handle(init?.method ?? 'GET', url, init?.body ? JSON.parse(String(init.body)) : null)
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

describe('MetricsRoute', () => {
  it('renders weight, calorie, bank, nutrition link and measurement sections', async () => {
    renderRoute(<MetricsRoute />)

    expect(await screen.findByText('⚖️ Weight')).toBeTruthy()
    expect(screen.getByText('🔥 Daily goal vs consumed')).toBeTruthy()
    expect(screen.getByText('🏦 Calorie bank (30 days)')).toBeTruthy()
    // Slice 14.5: the inline four-card nutrition summary is replaced by a link
    // card that opens the dedicated /nutrition route.
    const link = screen.getByTestId('nutrition-link')
    expect(link).toBeTruthy()
    expect(link.textContent).toContain('🥗 Nutrition')
    expect(screen.getByText('📏 Measurements')).toBeTruthy()

    // Current weight is rendered in stones and pounds, from the latest seeded
    // entry (it appears twice: the "Current" tile and the chart's last-point label).
    const latest = [...seed.weightEntries].sort((a, b) => b.date.localeCompare(a.date))[0]
    expect((await screen.findAllByText(formatStonesPounds(latest.weight_kg))).length).toBeGreaterThan(0)
  })
})

describe('FoodsRoute', () => {
  it('lists custom foods and hides search results until a query is typed', async () => {
    renderRoute(<FoodsRoute />)

    expect(await screen.findByText('🥗 My foods')).toBeTruthy()

    // Custom foods (is_edited = true) are counted and listed
    const custom = seed.foods.filter((food) => food.is_edited)
    expect(custom.length).toBeGreaterThan(0)
    expect(await screen.findByText(new RegExp(`^${custom.length} custom foods`))).toBeTruthy()
    expect(await screen.findByText(custom[0].name)).toBeTruthy()

    // No search results before a query is entered
    expect(screen.queryByText('Searching…')).toBeNull()
  })
})

describe('MetricsRoute — bank window label', () => {
  it('says which window the bank chart is computed over', async () => {
    renderRoute(<MetricsRoute />)

    // The caption is rendered before the user query resolves, so wait for the
    // window field to arrive rather than reading the first frame.
    expect(await screen.findByText(/computed over the last 14 days/)).toBeTruthy()
  })
})
