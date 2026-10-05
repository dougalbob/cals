import { describe, expect, it } from 'vitest'
import { bankWindowLabel, bankWindowPhrase } from './bank'

describe('bankWindowLabel', () => {
  it('names the window the default 14-day bank covers', () => {
    expect(bankWindowLabel(14)).toBe('Last 14 days')
  })

  it('handles the other presets, singular and custom values', () => {
    expect(bankWindowLabel(30)).toBe('Last 30 days')
    expect(bankWindowLabel(7)).toBe('Last 7 days')
    expect(bankWindowLabel(1)).toBe('Last day')
    expect(bankWindowLabel(21)).toBe('Last 21 days')
  })

  it('reads 0 as the all-time preset (decisions 66, 91)', () => {
    expect(bankWindowLabel(0)).toBe('All time')
  })

  it('returns null rather than inventing a window when the field is absent', () => {
    expect(bankWindowLabel(undefined)).toBeNull()
  })
})

describe('bankWindowPhrase', () => {
  it('reads naturally mid-sentence', () => {
    expect(bankWindowPhrase(14)).toBe('the last 14 days')
    expect(bankWindowPhrase(0)).toBe('all time')
    expect(bankWindowPhrase(1)).toBe('the last day')
  })

  it('returns null when there is no window to name', () => {
    expect(bankWindowPhrase(undefined)).toBeNull()
  })
})
