// @vitest-environment jsdom
let requests: { method: string; path: string; body: string | null }[] = []
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MeasurementPoint } from '../api/types'
import { MeasurementSheet, MEASUREMENT_STEP_CM } from './MeasurementSheet'
import { todayIso } from '../lib/format'

beforeEach(() => {
  requests = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    requests.push({ method: init?.method ?? 'GET', path, body: typeof init?.body === 'string' ? init.body : null })
    return new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderSheet(latest: MeasurementPoint | null) {
  const onClose = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MeasurementSheet part="waist_cm" latest={latest} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, ...view }
}

const waistPoint: MeasurementPoint = {
  value: 98.2,
  date: '2026-09-12',
  previous: { value: 99.4, date: '2026-08-21', previous: null },
}

describe('MeasurementSheet (decision 67)', () => {
  it('opens pre-filled with the last value and shows its history', () => {
    renderSheet(waistPoint)
    expect((screen.getByTestId('measurement-input') as HTMLInputElement).value).toBe('98.2')
    expect(screen.getByTestId('latest-value').textContent).toContain('98.2 cm')
    expect(screen.getByTestId('latest-value').textContent).toContain('12 Sep')
    expect(screen.getByText(/Was 99\.4 cm on 21 Aug/)).toBeTruthy()
  })

  it('steps by 0.5 cm (decision 99)', () => {
    expect(MEASUREMENT_STEP_CM).toBe(0.5)
    renderSheet(waistPoint)
    const input = screen.getByTestId('measurement-input') as HTMLInputElement

    fireEvent.click(screen.getByTestId('step-up'))
    expect(input.value).toBe('98.7')
    fireEvent.click(screen.getByTestId('step-down'))
    fireEvent.click(screen.getByTestId('step-down'))
    expect(input.value).toBe('97.7')
  })

  it('says what the change is versus the last measurement', () => {
    renderSheet(waistPoint)
    fireEvent.change(screen.getByTestId('measurement-input'), { target: { value: '97.0' } })
    expect(screen.getByTestId('measurement-delta').textContent).toContain('−1.2 cm vs last')
  })

  it("saves a changed value as today's measurement without asking again", async () => {
    const { onClose } = renderSheet(waistPoint)
    fireEvent.change(screen.getByTestId('measurement-input'), { target: { value: '97.5' } })
    fireEvent.click(screen.getByTestId('save-measurement'))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const post = requests.find((request) => request.method === 'POST')
    expect(post?.path).toBe('/api/measurements')
    expect(JSON.parse(post?.body ?? '{}')).toEqual({ date: todayIso(), waist_cm: 97.5 })
  })

  it("asks before saving an unchanged value — with the decision's wording", async () => {
    renderSheet(waistPoint)
    fireEvent.click(screen.getByTestId('save-measurement'))

    expect(screen.getByTestId('confirm-unchanged-text').textContent).toBe(
      "Measurement hasn't changed — is this correct?",
    )
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)

    fireEvent.click(screen.getByTestId('confirm-save-anyway'))
    await waitFor(() => expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1))
  })

  it('warns before discarding an unsaved change — and keeps editing', () => {
    renderSheet(waistPoint)
    fireEvent.change(screen.getByTestId('measurement-input'), { target: { value: '90.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByTestId('confirm-discard-text').textContent).toBe(
      'You have an unsaved measurement. Discard it?',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect((screen.getByTestId('measurement-input') as HTMLInputElement).value).toBe('90.0')
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)
  })

  it('discards and closes when the user confirms', () => {
    const { onClose } = renderSheet(waistPoint)
    fireEvent.change(screen.getByTestId('measurement-input'), { target: { value: '90.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByTestId('confirm-discard'))
    expect(onClose).toHaveBeenCalled()
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)
  })

  it('cancelling an untouched sheet closes without warning', () => {
    const { onClose } = renderSheet(waistPoint)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByTestId('confirm-discard-text')).toBeNull()
  })

  it('opens empty for a part never measured and saves the first value', async () => {
    const { onClose } = renderSheet(null)
    expect(screen.getByTestId('latest-value').textContent).toContain('first')
    expect(screen.getByText(/Same as the last|Steps move/)).toBeTruthy()

    fireEvent.change(screen.getByTestId('measurement-input'), { target: { value: '58.3' } })
    fireEvent.click(screen.getByTestId('save-measurement'))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const post = requests.find((request) => request.method === 'POST')
    expect(JSON.parse(post?.body ?? '{}')).toEqual({ date: todayIso(), waist_cm: 58.3 })
  })

  it('never steps into zero or negative values', () => {
    renderSheet({ value: 0.4, date: '2026-09-12', previous: null })
    fireEvent.click(screen.getByTestId('step-down'))
    expect((screen.getByTestId('measurement-input') as HTMLInputElement).value).toBe('0.4')
  })
})
