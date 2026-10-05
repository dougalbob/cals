// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { MeasurementLatest } from '../api/types'
import { BodyMap } from './BodyMap'

afterEach(cleanup)

const point = (value: number, date: string, previous: MeasurementLatest['waist_cm'] = null) => ({
  value,
  date,
  previous,
})

function emptyLatest(): MeasurementLatest {
  return {
    neck_cm: null,
    chest_cm: null,
    bust_cm: null,
    waist_cm: null,
    upper_arm_cm: null,
    hips_cm: null,
    thigh_cm: null,
  }
}

describe('BodyMap (decision 67)', () => {
  it('shows Bust instead of Chest on the female outline (decision 98)', () => {
    render(<BodyMap outline="female" latest={emptyLatest()} onPick={() => undefined} />)
    expect(screen.getByTestId('body-point-bust_cm')).toBeTruthy()
    expect(screen.queryByTestId('body-point-chest_cm')).toBeNull()
  })

  it('shows Chest instead of Bust on the male outline (decision 98)', () => {
    render(<BodyMap outline="male" latest={emptyLatest()} onPick={() => undefined} />)
    expect(screen.getByTestId('body-point-chest_cm')).toBeTruthy()
    expect(screen.queryByTestId('body-point-bust_cm')).toBeNull()
  })

  it('labels a measured point with its last value and date', () => {
    const latest = { ...emptyLatest(), waist_cm: point(98.2, '2026-10-02') }
    render(<BodyMap outline="male" latest={latest} onPick={() => undefined} />)
    const waist = screen.getByTestId('body-point-waist_cm')
    expect(waist.getAttribute('aria-label')).toContain('98.2 cm')
    expect(waist.getAttribute('aria-label')).toContain('2 Oct')
  })

  it('labels a never-measured part as such', () => {
    render(<BodyMap outline="female" latest={emptyLatest()} onPick={() => undefined} />)
    expect(screen.getByTestId('body-point-thigh_cm').getAttribute('aria-label')).toContain('not measured yet')
  })

  it('marks measured parts filled and unmeasured parts hollow', () => {
    const latest = { ...emptyLatest(), waist_cm: point(98.2, '2026-10-02') }
    const { container } = render(<BodyMap outline="male" latest={latest} onPick={() => undefined} />)

    const measuredDot = screen.getByTestId('body-point-waist_cm').querySelector('span')
    const hollowDot = screen.getByTestId('body-point-thigh_cm').querySelector('span')
    expect(measuredDot?.className).toContain('bg-danger')
    expect(hollowDot?.className).toContain('border-2')
    expect(container.querySelectorAll('button').length).toBe(6)
  })

  it('keeps the 44 px tap target while the visible dot stays small', () => {
    render(<BodyMap outline="male" latest={emptyLatest()} onPick={() => undefined} />)
    const button = screen.getByTestId('body-point-waist_cm')
    expect(button.className).toContain('h-11')
    expect(button.className).toContain('w-11')
    const dot = button.querySelector('span')
    expect(dot?.className).toContain('h-3')
  })

  it('hands the picked part back to the page', () => {
    const onPick = vi.fn()
    render(<BodyMap outline="male" latest={emptyLatest()} onPick={onPick} />)
    fireEvent.click(screen.getByTestId('body-point-hips_cm'))
    expect(onPick).toHaveBeenCalledWith('hips_cm')
  })
})
