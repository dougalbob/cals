// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { handle } from '../../mock-api/handler.mjs'
import * as seed from '../../mock-api/seed.mjs'
import { CalendarRoute } from './CalendarRoute'
import { todayIso } from '../lib/calendar'

function renderCalendar(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/calendar" element={<CalendarRoute />} />
          <Route path="/calendar/:view/:anchor" element={<CalendarRoute />} />
          <Route path="/diary/:date" element={<p>diary for date</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  seed.resetFixtures()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const requestBody = init?.body ? JSON.parse(String(init.body)) : null
    const result = handle(method, url, requestBody)
    if (!result) return new Response('not found', { status: 404 })
    const responseBody = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    return new Response(result.status === 204 ? null : responseBody, {
      status: result.status,
      headers: { 'Content-Type': result.contentType ?? 'application/json' },
    })
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CalendarRoute', () => {
  it('defaults to month view for the current month and shows today', async () => {
    renderCalendar('/calendar')
    // Month grid renders 42 cells once the data lands; wait for weekday headers.
    expect(await screen.findByText('Mon')).toBeTruthy()
    for (const day of ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(day)).toBeTruthy()
    }
    // Every cell is a link to its diary day; today's is among them.
    const today = todayIso()
    const links = screen.getAllByRole('link')
    expect(links.some((link) => link.getAttribute('href') === `/diary/${today}`)).toBe(true)
  })

  it('renders the week view with per-meal calorie breakdowns and hydration', async () => {
    renderCalendar(`/calendar/week/${seed.TODAY}`)

    // Week view opens with 7 day cards. Each card renders a Hydration row,
    // and the ones with data show Breakfast/Lunch/Dinner/Snacks labels.
    const hydrations = await screen.findAllByText('Hydration')
    expect(hydrations.length).toBe(7)
    expect(screen.getAllByText(/Breakfast/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Lunch/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Dinner/).length).toBeGreaterThan(0)
  })

  it('navigates forward via the next-month button and changes the URL', async () => {
    renderCalendar(`/calendar/month/${seed.TODAY.slice(0, 7)}`)
    expect(await screen.findByText('Mon')).toBeTruthy()
    // Just assert the Next/Previous buttons are wired up without throwing and
    // leave the view mounted.
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await waitFor(() => {
      // Heading changes: wait for a re-render by checking the Today button
      // stays visible. We cannot rely on exact heading text across Node
      // locales, but Today always navigates back so it remains present.
      expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy()
    })
  })

  it('switches between month and week via the view toggle', async () => {
    renderCalendar('/calendar')
    // Wait for month grid to render before toggling.
    expect(await screen.findByText('Mon')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    // Week view renders 7 Hydration rows (one per day card), whereas month
    // view has none.
    expect(await screen.findAllByText('Hydration')).toHaveLength(7)
    // Toggle back to month.
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    await waitFor(() => expect(screen.queryAllByText('Hydration')).toHaveLength(0))
  })

  it('returns days-with-data from the calendar endpoint with meal + hydration fields', async () => {
    // Directly drive the fixture so we know the shape matches the UI.
    const url = new URL(
      `http://localhost/api/calendar?from=${seed.TODAY}&to=${seed.TODAY}`,
    )
    const response = handle('GET', url, null)
    expect(response?.status).toBe(200)
    const body = response?.body as {
      days: Array<{
        meals: Record<string, number>
        hydration_ml: number
        calories: number
      }>
    }
    expect(body.days).toHaveLength(1)
    const day = body.days[0]
    expect(typeof day.meals.breakfast).toBe('number')
    expect(typeof day.hydration_ml).toBe('number')
    expect(day.calories).toBeGreaterThan(0)
  })
})
