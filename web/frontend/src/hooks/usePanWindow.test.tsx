// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { usePanWindow } from './usePanWindow'
import { addDays, todayIso } from '../lib/format'
import { pointerDown, pointerMove, pointerUp, withClientWidth } from '../test-support/pointer'

/**
 * Two charts sharing one window, exactly as MetricsRoute uses the hook: both
 * refs attach, dragging either moves the same `?from=&to=`.
 */
function Harness({ days = 30 }: { days?: number }) {
  const pan = usePanWindow(days)
  const location = useLocation()
  return (
    <div>
      <div onPointerDown={pan.onPointerDown} data-testid="chart-a" data-panning={pan.panning} />
      <div onPointerDown={pan.onPointerDown} data-testid="chart-b" />
      <span data-testid="from">{pan.from}</span>
      <span data-testid="to">{pan.to}</span>
      <span data-testid="search">{location.search}</span>
    </div>
  )
}

function renderHarness(path = '/metrics') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>,
  )
}

/** 300 px wide over a 30-day window is 10 px per day. */
function chart(testId: 'chart-a' | 'chart-b'): HTMLElement {
  return withClientWidth(screen.getByTestId(testId), 300)
}

const vibrate = vi.fn()

beforeEach(() => {
  vibrate.mockClear()
  Object.defineProperty(window.navigator, 'vibrate', { value: vibrate, configurable: true })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window.navigator, 'vibrate')
  vi.useRealTimers()
})

describe('usePanWindow', () => {
  it('slides the chart with the finger to reveal older days, and ticks haptics', () => {
    renderHarness()
    const to = screen.getByTestId('to').textContent as string

    act(() => {
      pointerDown(chart('chart-a'), 100)
      pointerMove(300)
      pointerUp(300)
    })

    // 200 px right at 10 px/day slides the window 20 days further back.
    expect(screen.getByTestId('to').textContent).toBe(addDays(to, -20))
    expect(screen.getByTestId('from').textContent).toBe(addDays(to, -49))
    // The window rides in the URL so a reload or a link reopens it.
    expect(screen.getByTestId('search').textContent).toContain(`from=${addDays(to, -49)}`)
    expect(vibrate).toHaveBeenCalledWith(5)
  })

  it('requires a click-and-hold before a mouse drag pans', () => {
    vi.useFakeTimers()
    renderHarness()
    const from = screen.getByTestId('from').textContent as string

    // A quick click-drag is not a pan…
    act(() => {
      pointerDown(chart('chart-a'), 100, 'mouse')
      pointerMove(300, 'mouse')
      pointerUp(300, 'mouse')
    })
    expect(screen.getByTestId('from').textContent).toBe(from)
    expect(screen.getByTestId('search').textContent).toBe('')

    // …but holding first makes it one (decision 69).
    act(() => {
      pointerDown(chart('chart-a'), 100, 'mouse')
      vi.advanceTimersByTime(200)
      pointerMove(300, 'mouse')
      pointerUp(300, 'mouse')
    })
    expect(screen.getByTestId('from').textContent).toBe(addDays(from, -20))
  })

  it('moves the same window from either shared chart', () => {
    renderHarness()
    const to = screen.getByTestId('to').textContent as string

    act(() => {
      pointerDown(chart('chart-b'), 100)
      pointerMove(300)
      pointerUp(300)
    })

    expect(screen.getByTestId('to').textContent).toBe(addDays(to, -20))
  })

  it('stops at today when dragged forward', () => {
    const today = todayIso()
    renderHarness(`/metrics?from=${addDays(today, -60)}&to=${addDays(today, -31)}`)

    act(() => {
      // 400 px left is 40 days forward: past today, so the window clamps there.
      pointerDown(chart('chart-a'), 500)
      pointerMove(100)
      pointerUp(100)
    })

    expect(screen.getByTestId('to').textContent).toBe(today)
    expect(screen.getByTestId('from').textContent).toBe(addDays(today, -29))
  })

  it('opens a deep-linked window and ignores a future one', () => {
    const today = todayIso()
    renderHarness(`/metrics?from=${addDays(today, -60)}&to=${addDays(today, -31)}`)
    expect(screen.getByTestId('from').textContent).toBe(addDays(today, -60))
    expect(screen.getByTestId('to').textContent).toBe(addDays(today, -31))

    cleanup()
    renderHarness(`/metrics?from=${addDays(today, -5)}&to=${addDays(today, 5)}`)
    expect(screen.getByTestId('to').textContent).toBe(today)
    expect(screen.getByTestId('from').textContent).toBe(addDays(today, -5))
  })
})
