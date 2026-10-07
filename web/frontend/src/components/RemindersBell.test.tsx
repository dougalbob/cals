// @vitest-environment jsdom
/**
 * The reminders bell (decisions 121–122).
 *
 * The fixture stub answers GET /api/reminders with the exact wire shape of
 * internal/models.ReminderItem — fully normalised fields, explicit nulls — so
 * the copy and the deep links are pinned against the real API contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { RemindersBell } from './RemindersBell'
import { formatWeekRangeLabel } from '../lib/calendar'
import { formatShortDate } from '../lib/format'
import type { ReminderItem, RemindersResponse } from '../api/types'

const cadenceItem = (type: 'weigh_in' | 'body_measurements', days: number | null, last: string | null, cadence: number): ReminderItem => ({
  type,
  last_date: last,
  days_since: days,
  cadence_days: cadence,
  week_from: null,
  week_to: null,
})

const reportItem: ReminderItem = {
  type: 'weekly_report',
  last_date: null,
  days_since: null,
  cadence_days: 0,
  week_from: '2026-09-28',
  week_to: '2026-10-04',
}

let response: RemindersResponse = { items: [] }

function renderBell(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <RemindersBell />
                <LocationProbe />
              </>
            }
          />
          <Route path="/metrics" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

beforeEach(() => {
  response = { items: [] }
  vi.stubGlobal('fetch', async () => {
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RemindersBell (decisions 121–122)', () => {
  it('stays quiet with no badge when nothing is due', async () => {
    renderBell()
    const bell = await screen.findByTestId('reminders-bell')
    expect(bell.getAttribute('aria-label')).toBe('Reminders')
    expect(screen.queryByTestId('reminders-badge')).toBeNull()

    fireEvent.click(bell)
    expect(await screen.findByTestId('reminders-all-clear')).toBeTruthy()
  })

  it('shows a count badge and lists every due item with its action', async () => {
    response = {
      items: [
        cadenceItem('weigh_in', 5, '2026-10-02', 3),
        cadenceItem('body_measurements', 17, '2026-09-20', 14),
        reportItem,
      ],
    }
    renderBell()

    const bell = await screen.findByTestId('reminders-bell')
    await waitFor(() => expect(screen.getByTestId('reminders-badge').textContent).toBe('3'))
    expect(bell.getAttribute('aria-label')).toBe('Reminders, 3 need attention')

    fireEvent.click(bell)
    const list = await screen.findByTestId('reminders-list')
    expect(within(list).getByText('Time to weigh in')).toBeTruthy()
    // Wording is pinned through the same formatters the component uses, so
    // the suite is not coupled to the runtime's ICU month abbreviations.
    expect(within(list).getByText(`Last weigh-in ${formatShortDate('2026-10-02')} · 5 days ago`)).toBeTruthy()
    expect(within(list).getByTestId('reminder-action-weigh_in').textContent).toBe('Log weigh-in')
    expect(within(list).getByText('Time for body measurements')).toBeTruthy()
    expect(within(list).getByText(`Last measured ${formatShortDate('2026-09-20')} · 17 days ago`)).toBeTruthy()
    expect(within(list).getByTestId('reminder-action-body_measurements').textContent).toBe('Add measurements')
    expect(within(list).getByText('Weekly report ready')).toBeTruthy()
    expect(
      within(list).getByText(`Your report for ${formatWeekRangeLabel('2026-09-28', '2026-10-04')} is complete`),
    ).toBeTruthy()
    expect(within(list).getByTestId('reminder-action-weekly_report').textContent).toBe('View report')
  })

  it('names the absence for someone who has never recorded the data', async () => {
    response = {
      items: [
        cadenceItem('weigh_in', null, null, 3),
        cadenceItem('body_measurements', null, null, 14),
      ],
    }
    renderBell()
    fireEvent.click(await screen.findByTestId('reminders-bell'))

    const list = await screen.findByTestId('reminders-list')
    expect(within(list).getByText('No weigh-in recorded yet')).toBeTruthy()
    expect(within(list).getByText('No measurements recorded yet')).toBeTruthy()
  })

  it('navigates each action to its Metrics deep link and closes', async () => {
    response = { items: [cadenceItem('weigh_in', 4, '2026-10-03', 3)] }
    renderBell()
    fireEvent.click(await screen.findByTestId('reminders-bell'))

    fireEvent.click(await screen.findByTestId('reminder-action-weigh_in'))
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/metrics?open=weigh-in'),
    )
    expect(screen.queryByTestId('reminders-list')).toBeNull()
  })

  it('opens the completed week on the report card', async () => {
    response = { items: [reportItem] }
    renderBell()
    fireEvent.click(await screen.findByTestId('reminders-bell'))
    fireEvent.click(await screen.findByTestId('reminder-action-weekly_report'))

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/metrics?report=week&report_anchor=2026-09-28',
      ),
    )
  })
})
