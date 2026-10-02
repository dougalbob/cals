import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatStonesPounds,
  kgToStonesPounds,
  percentOf,
  relativeDayLabel,
  todayIso,
} from './format'

describe('addDays', () => {
  it('crosses month boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('handles leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('is stable across a DST change (no off-by-one date)', () => {
    // UK clocks go forward on 2026-03-29
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })
})

describe('kgToStonesPounds', () => {
  it('converts a round figure', () => {
    // 63.5 kg ≈ 10 st 0 lb
    expect(kgToStonesPounds(63.503)).toEqual({ stones: 10, pounds: 0 })
  })

  it('carries 13.9 lb up to the next stone', () => {
    const { stones, pounds } = kgToStonesPounds(89.6)
    expect(stones).toBe(14)
    expect(pounds).toBeLessThan(14)
  })

  it('formats for display', () => {
    // 89.6 kg = 197.53 lb = 14 st 1.53 lb
    expect(formatStonesPounds(89.6)).toBe('14 st 1.5 lb')
  })
})

describe('percentOf', () => {
  it('clamps to 0–100 and survives a zero target', () => {
    expect(percentOf(50, 100)).toBe(50)
    expect(percentOf(150, 100)).toBe(100)
    expect(percentOf(50, 0)).toBe(0)
  })
})

describe('relativeDayLabel', () => {
  it('names today and yesterday', () => {
    expect(relativeDayLabel('2026-10-02', '2026-10-02')).toBe('Today')
    expect(relativeDayLabel('2026-10-01', '2026-10-02')).toBe('Yesterday')
    expect(relativeDayLabel('2026-09-30', '2026-10-02')).toBe('Wednesday 30 September')
  })
})

describe('todayIso', () => {
  it('zero-pads', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
