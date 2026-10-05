// @vitest-environment jsdom
/**
 * Phase 14.3: the weigh-in and goal-vs-consumed charts pan one shared window
 * (decision 69), and the trend window comes from the user record rather than a
 * hard-coded 7 (decision 95).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { MetricsRoute } from './MetricsRoute'
import { pointerDown, pointerMove, pointerUp, withClientWidth } from '../test-support/pointer'

const calls: string[] = []
let trendDays = 7

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

function renderMetrics(path = '/metrics') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/metrics" element={<MetricsRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  trendDays = 7
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    calls.push(`${url.pathname}${url.search}`)
    // The user record is the source of the trend window, so the test controls
    // it here to prove the chart reads the column.
    if (url.pathname === '/api/users/me') return json({ ...seed.user, weight_trend_days: trendDays })
    const result = handle(init?.method ?? 'GET', url, init?.body ? JSON.parse(String(init.body)) : null)
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

describe('MetricsRoute — 14.3 charts', () => {
  it('labels the trend with the window the user record carries, not a hard-coded 7', async () => {
    trendDays = 10
    renderMetrics()

    expect(await screen.findByText(/10-weigh-in moving average/)).toBeTruthy()
    expect(screen.queryByText(/7-weigh-in moving average/)).toBeNull()
  })

  it('pans the shared window from the weigh-in chart and re-fetches both charts', async () => {
    renderMetrics()
    const element = withClientWidth(await screen.findByTestId('weight-pan'), 300)
    const before = screen.getByTestId('weight-window').textContent as string

    act(() => {
      pointerDown(element, 100)
      pointerMove(300) // 200 px right is 20 days back
      pointerUp(300)
    })

    await waitFor(() => expect(screen.getByTestId('weight-window').textContent).not.toBe(before))
    const range = (screen.getByTestId('weight-window').textContent as string)
      .replace('Showing ', '')
      .split(' · ')[0]
    // One window, two charts: the goal chart shows the same range.
    expect(screen.getByTestId('goal-window').textContent).toContain(range)

    const calorieCalls = calls.filter((call) => call.startsWith('/api/stats/calories'))
    const weightRangeCalls = calls.filter((call) => call.startsWith('/api/weight?from='))
    expect(calorieCalls.length).toBeGreaterThanOrEqual(2)
    const query = (calorieCalls.at(-1) as string).split('?')[1]
    expect(weightRangeCalls.some((call) => call.endsWith(query))).toBe(true)

    // The bank line keeps its fixed window while the charts pan (decision 95).
    const bankCalls = calls.filter((call) => call.startsWith('/api/stats/bank'))
    expect(bankCalls.length).toBeGreaterThan(0)
    expect(bankCalls.every((call) => call.includes('days=30'))).toBe(true)
  })

  it('says so when a panned window predates the diary, rather than drawing flat bars', async () => {
    // Deep-link a window ~200 days back, well before the fixture's diary.
    const today = new Date()
    const iso = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
    renderMetrics(`/metrics?from=${iso(-230)}&to=${iso(-201)}`)

    expect(await screen.findByText(/Nothing logged in this window/)).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Daily totals' })).toBeNull()
  })

  it('keeps the summary tiles on the fixed 90-day fetch while the chart pans', async () => {
    renderMetrics()
    const element = withClientWidth(await screen.findByTestId('weight-pan'), 300)

    act(() => {
      pointerDown(element, 100)
      pointerMove(200)
      pointerUp(200)
    })

    await waitFor(() => expect(calls.some((call) => call.startsWith('/api/weight?from='))).toBe(true))
    expect(calls.some((call) => call === '/api/weight?days=90')).toBe(true)
  })
})
