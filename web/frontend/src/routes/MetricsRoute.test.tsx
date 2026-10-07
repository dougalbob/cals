// @vitest-environment jsdom
/**
 * Phase 14.3: the weigh-in and goal-vs-consumed charts pan one shared window
 * (decision 69), and the trend window comes from the user record rather than a
 * hard-coded 7 (decision 95).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { MetricsRoute } from './MetricsRoute'
import { pointerDown, pointerMove, pointerUp, withClientWidth } from '../test-support/pointer'
import { addDays, formatShortDate, stonesPoundsToKg, todayIso } from '../lib/format'

const calls: string[] = []
const requests: { path: string; method: string; body: unknown }[] = []
let trendDays = 7
let holdPannedRangeRequests = false
const pendingRangeResolves: ((response: Response) => void)[] = []

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
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Reports the URL back to the deep-link assertions (decision 121). */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

beforeEach(() => {
  seed.resetFixtures()
  calls.length = 0
  requests.length = 0
  trendDays = 7
  holdPannedRangeRequests = false
  pendingRangeResolves.length = 0
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push(`${url.pathname}${url.search}`)
    requests.push({ path: `${url.pathname}${url.search}`, method, body })
    const isPannedMetricsRequest =
      (url.pathname === '/api/weight' || url.pathname === '/api/stats/calories') &&
      url.searchParams.has('from') &&
      url.searchParams.has('to')
    if (holdPannedRangeRequests && isPannedMetricsRequest) {
      return new Promise<Response>((resolve) => pendingRangeResolves.push(resolve))
    }
    // The user record is the source of the trend window, so the test controls
    // it here to prove the chart reads the column. Mutations still go through
    // the fixture handler so their state changes are observable.
    if (url.pathname === '/api/users/me' && method === 'GET') return json({ ...seed.user, weight_trend_days: trendDays })
    const result = handle(method, url, body)
    if (!result) return new Response('not found', { status: 404 })
    const bodyText = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    return new Response(result.status === 204 ? null : bodyText, {
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

  it('keeps the previous chart data visible while a new panned range is loading', async () => {
    renderMetrics()
    expect(await screen.findByRole('group', { name: 'Weigh-ins with trend' })).toBeTruthy()
    expect(await screen.findByRole('img', { name: 'Daily totals' })).toBeTruthy()

    // Leave both new-range requests unresolved to inspect the in-between state.
    holdPannedRangeRequests = true
    const element = withClientWidth(screen.getByTestId('weight-pan'), 300)
    act(() => {
      pointerDown(element, 100)
      pointerMove(300)
      pointerUp(300)
    })

    await waitFor(() => expect(pendingRangeResolves).toHaveLength(2))
    expect(screen.getByRole('group', { name: 'Weigh-ins with trend' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Daily totals' })).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()

    // Let the pending fixture reads finish so the test leaves no open work.
    const resolvePending = pendingRangeResolves.splice(0)
    await act(async () => {
      resolvePending.forEach((resolve) => resolve(json([])))
    })
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

describe('MetricsRoute — requested weight and history improvements', () => {
  it('shows an all-time weigh-in date in the card, even when it is outside the summary window', async () => {
    const oldDate = seed.dateOffset(250)
    const otherUsers = seed.weightEntries.filter((entry) => entry.user_id !== seed.user.id)
    seed.weightEntries.splice(0, seed.weightEntries.length, ...otherUsers, {
      id: Math.max(...seed.weightEntries.map((entry) => entry.id)) + 1,
      user_id: seed.user.id,
      date: oldDate,
      weight_kg: 79.4,
      created_at: `${oldDate}T12:00:00Z`,
    })
    renderMetrics()

    expect(await screen.findByTestId('weigh-in-action')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByTestId('weigh-in-action').textContent).toContain(`Last: ${formatShortDate(oldDate)}`),
    )
    expect(calls).toContain('/api/weight/latest')
    expect(calls).toContain('/api/weight?days=90')
  })

  it('opens a backdateable stones-and-pounds weigh-in sheet and saves canonical kg', async () => {
    const entryDate = addDays(todayIso(), -2)
    seed.weightEntries.splice(
      0,
      seed.weightEntries.length,
      ...seed.weightEntries.filter((entry) => entry.date !== entryDate),
    )
    renderMetrics()

    fireEvent.click(await screen.findByRole('button', { name: 'Add weigh-in' }))
    expect((await screen.findByLabelText('Weigh-in date') as HTMLInputElement).value).toBe(todayIso())
    expect(screen.getByLabelText('Weight in stones')).toBeTruthy()
    expect(screen.getByLabelText('Weight in pounds')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Weigh-in date'), { target: { value: entryDate } })
    fireEvent.change(screen.getByLabelText('Weight in stones'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Weight in pounds'), { target: { value: '7.1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save weigh-in' }))

    const expectedKg = stonesPoundsToKg(12, 7.1)
    await waitFor(() => expect(seed.weightEntries.find((entry) => entry.date === entryDate)?.weight_kg).toBeCloseTo(expectedKg))
    expect(screen.queryByRole('dialog', { name: 'Add weigh-in' })).toBeNull()
    expect(requests.find((request) => request.path === '/api/weight' && request.method === 'POST')?.body).toEqual({
      date: entryDate,
      weight_kg: expectedKg,
    })
  })

  it('uses the account’s kilogram preference for the weigh-in sheet', async () => {
    seed.user.weight_unit = 'kg'
    renderMetrics()
    await screen.findByRole('button', { name: /Edit target weight/ })
    fireEvent.click(await screen.findByRole('button', { name: 'Add weigh-in' }))

    expect(await screen.findByText('Enter your weight in kilograms.')).toBeTruthy()
    expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy()
    expect(screen.queryByLabelText('Weight in stones')).toBeNull()
  })

  it('uses two numeric fields for a stones-and-pounds target', async () => {
    renderMetrics()
    fireEvent.click(await screen.findByRole('button', { name: /Edit target weight/ }))

    const stones = await screen.findByLabelText('Target weight in stones') as HTMLInputElement
    const pounds = screen.getByLabelText('Target weight in pounds') as HTMLInputElement
    expect(stones.inputMode).toBe('numeric')
    expect(pounds.inputMode).toBe('decimal')
    fireEvent.change(stones, { target: { value: '13' } })
    fireEvent.change(pounds, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save target' }))

    const expectedKg = Math.round(stonesPoundsToKg(13, 2) * 10) / 10
    await waitFor(() => expect(seed.user.target_weight_kg).toBeCloseTo(expectedKg))
    expect(requests.find((request) => request.path === '/api/users/me' && request.method === 'PUT')?.body).toEqual({
      target_weight_kg: expectedKg,
    })
  })

  it('retains the target unit switcher and carries the entered value across units', async () => {
    renderMetrics()
    fireEvent.click(await screen.findByRole('button', { name: /Edit target weight/ }))
    fireEvent.change(await screen.findByLabelText('Target weight in stones'), { target: { value: '13' } })
    fireEvent.change(screen.getByLabelText('Target weight in pounds'), { target: { value: '2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Kilograms' }))
    expect((screen.getByLabelText('Target weight in kilograms') as HTMLInputElement).value).toBe('83.5')
    fireEvent.click(screen.getByRole('button', { name: 'Stones / lb' }))
    expect((screen.getByLabelText('Target weight in stones') as HTMLInputElement).value).toBe('13')
    expect((screen.getByLabelText('Target weight in pounds') as HTMLInputElement).value).toBe('2.1')
  })

  it('keeps the target editor in kilograms for a kg-preference account', async () => {
    seed.user.weight_unit = 'kg'
    renderMetrics()
    fireEvent.click(await screen.findByRole('button', { name: /Edit target weight/ }))

    expect(await screen.findByLabelText('Target weight in kilograms')).toBeTruthy()
    expect(screen.queryByLabelText('Target weight in stones')).toBeNull()
  })

  it('shows old measurement sessions instead of hiding everything before the 400-day window', async () => {
    const oldDate = '2024-01-15'
    const id = Math.max(...seed.measurements.map((entry) => entry.id)) + 1
    seed.measurements.push({
      id,
      user_id: seed.user.id,
      date: oldDate,
      waist_cm: 77.4,
      created_at: `${oldDate}T07:10:00Z`,
    })
    renderMetrics()

    expect(await screen.findByTestId('measurement-history')).toBeTruthy()
    expect(screen.getByTestId('measurement-history').textContent).toContain('77.4')
    expect(calls).toContain('/api/measurements?all=true')
  })

  it('briefly displays the selected weigh-in dot value on tap', async () => {
    renderMetrics()
    const point = await screen.findByTestId('line-chart-point-2')
    fireEvent.click(point)

    expect(screen.getByTestId('line-chart-point-tooltip').textContent).toMatch(/.+ · \d+ st \d+\.\d lb/)
    expect(screen.getByTestId('chart-point-status').textContent).toContain('Selected weigh-in:')
  })
})

describe('MetricsRoute — reminders deep links (decision 121)', () => {
  it('opens the weigh-in sheet from the bell link and clears the parameter when it closes', async () => {
    renderMetrics('/metrics?open=weigh-in')

    expect(await screen.findByTestId('weigh-in-sheet')).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/metrics?open=weigh-in')

    // Cancel closes the sheet and clears ?open= — the URL stays the state.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('weigh-in-sheet')).toBeNull())
    expect(screen.getByTestId('location').textContent).toBe('/metrics')
  })

  it('still opens the sheet from its own button when no deep link is present', async () => {
    renderMetrics()
    fireEvent.click(await screen.findByRole('button', { name: 'Add weigh-in' }))

    expect(await screen.findByTestId('weigh-in-sheet')).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/metrics')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('weigh-in-sheet')).toBeNull())
  })

  it('scrolls the body map into view for ?open=measurements and cleans the parameter up', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    })
    try {
      renderMetrics('/metrics?open=measurements')
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/metrics'))
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })
})
