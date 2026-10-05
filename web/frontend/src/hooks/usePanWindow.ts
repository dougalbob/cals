import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useSearchParams } from 'react-router'
import { addDays, todayIso } from '../lib/format'

/**
 * Drag-to-pan a windowed chart (decision 69).
 *
 * The window is `days` long and always ends on or before today. The chart
 * follows the finger like a map: dragging it to the right slides the days
 * rightwards and reveals older ones; dragging left comes back towards today,
 * which is as far forward as the window can go. The visible range rides in the
 * URL as `?from=&to=` so a reload or a deep link reopens the same view — the
 * same rule the Calendar follows — and each move re-fetches through the
 * `from`/`to` parameters slice 14.1 added to the metrics endpoints.
 *
 * Drag gestures:
 * - touch/pen — moves as soon as the pointer has travelled far enough to be a
 *   drag rather than a tap, and ticks `navigator.vibrate` once per day of
 *   movement; haptics are a bonus, never a dependency, and iOS ignores them;
 * - mouse — only after a short click-and-hold, so a plain click stays a click.
 *
 * Several charts can share one window (14.3 pans the weigh-in and
 * goal-vs-consumed charts together): put the returned `onPointerDown` on each
 * of them. The drag then lives on the window, so it survives the pointer
 * leaving the chart, and is torn down on release.
 */
export interface PanWindow {
  /** First visible day, `YYYY-MM-DD`. */
  from: string
  /** Last visible day, `YYYY-MM-DD`, never after today. */
  to: string
  /** True while a drag is in progress, for cursor styling. */
  panning: boolean
  /**
   * Attach to every chart sharing the window. The element also needs
   * `touch-pan-y select-none` so a horizontal drag reaches the handler while a
   * vertical swipe still scrolls the page.
   */
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
}

/** A touch must travel this far before it counts as a pan rather than a tap. */
const TOUCH_START_PX = 6

/** A mouse must be held this long before a drag becomes a pan. */
const MOUSE_HOLD_MS = 150

/** One short haptic tick per day of movement; no continuous buzzing. */
const HAPTIC_MS = 5

export function usePanWindow(days = 30): PanWindow {
  const [searchParams, setSearchParams] = useSearchParams()
  const [panning, setPanning] = useState(false)

  const today = todayIso()
  const requestedTo = searchParams.get('to')
  const requestedFrom = searchParams.get('from')
  // A future `to` from an edited URL falls back to today rather than asking the
  // API for a window it would refuse; a `from` after `to` is ignored too.
  const to = requestedTo && requestedTo <= today ? requestedTo : today
  const from = requestedFrom && requestedFrom <= to ? requestedFrom : addDays(to, -(days - 1))

  // A drag that is still in progress when the component unmounts must not leave
  // listeners behind.
  const stopDrag = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      stopDrag.current?.()
      stopDrag.current = null
    },
    [],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return

      const target = event.currentTarget
      const pointerId = event.pointerId
      const startX = event.clientX
      const startFrom = from
      const startTo = to
      let dayDelta = 0
      let active = false
      let holdTimer: number | undefined

      const moveBy = (delta: number) => {
        const limit = todayIso()
        let nextTo = addDays(startTo, delta)
        let nextFrom = addDays(startFrom, delta)
        if (nextTo > limit) {
          // Never pan into the future; the window stops with `to` on today.
          nextTo = limit
          nextFrom = addDays(nextTo, -(days - 1))
        }
        if (nextFrom === from && nextTo === to) return
        setSearchParams(
          (params) => {
            const updated = new URLSearchParams(params)
            updated.set('from', nextFrom)
            updated.set('to', nextTo)
            return updated
          },
          { replace: true },
        )
      }

      const print = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const dx = moveEvent.clientX - startX
        if (!active) {
          if (moveEvent.pointerType === 'mouse') {
            // Moving before the hold elapsed cancels the pan: it is a click-drag
            // the browser may still be using for selection or scrolling.
            if (Math.abs(dx) > TOUCH_START_PX) finish()
            return
          }
          if (Math.abs(dx) < TOUCH_START_PX) return
          active = true
          setPanning(true)
        }
        const pxPerDay = Math.max(1, target.clientWidth / days)
        const delta = Math.round(-dx / pxPerDay)
        if (delta !== dayDelta) {
          dayDelta = delta
          moveBy(delta)
          navigator.vibrate?.(HAPTIC_MS)
        }
      }

      function finish(event?: PointerEvent) {
        window.clearTimeout(holdTimer)
        window.removeEventListener('pointermove', print)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        stopDrag.current = null
        if (event && target.hasPointerCapture?.(pointerId)) target.releasePointerCapture?.(pointerId)
        setPanning(false)
      }

      stopDrag.current?.()
      window.addEventListener('pointermove', print)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
      stopDrag.current = finish

      // Touch pans as soon as it moves; a mouse has to be held first so a plain
      // click on the chart is still a click (decision 69).
      if (event.pointerType === 'mouse') {
        holdTimer = window.setTimeout(() => {
          active = true
          setPanning(true)
          target.setPointerCapture?.(pointerId)
        }, MOUSE_HOLD_MS)
      }
    },
    [days, from, to, setSearchParams],
  )

  return { from, to, panning, onPointerDown }
}
