// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BANK_RING_LIMIT_KCAL, bankArcTransform, CalorieRing } from './CalorieRing'

const GREEN = '#26de81'
const RED = '#fc5c65'
const NEUTRAL = '#edf2f7'
/** A plain rotation: the arc's dash starts at 12 o'clock and runs forwards (clockwise). */
const CLOCKWISE = 'rotate(-90 95 95)'
/** A reflection about the ring's vertical axis: same 12 o'clock start, mirrored sweep. */
const ANTICLOCKWISE = `translate(190 0) scale(-1 1) ${CLOCKWISE}`

afterEach(cleanup)

function renderRing(bankBalance: number, consumed = 1_500, goal = 2_000) {
  const view = render(<CalorieRing bankBalance={bankBalance} consumed={consumed} goal={goal} />)
  const image = screen.getByRole('img')
  const circles = image.querySelectorAll('circle')
  const outerProgress = circles[1]
  if (!outerProgress) throw new Error('Expected the outer progress circle')

  const circumference = Number(outerProgress.getAttribute('stroke-dasharray'))
  const offset = Number(outerProgress.getAttribute('stroke-dashoffset'))
  return {
    image,
    outerProgress,
    transform: outerProgress.getAttribute('transform'),
    unmount: view.unmount,
    fraction: 1 - offset / circumference,
  }
}

describe('bankArcTransform', () => {
  it("anchors both directions at 12 o'clock and only mirrors the deficit", () => {
    expect(bankArcTransform(1_000, 190)).toBe(CLOCKWISE)
    expect(bankArcTransform(0, 190)).toBe(CLOCKWISE)
    expect(bankArcTransform(-1, 190)).toBe(ANTICLOCKWISE)
    expect(bankArcTransform(-2_000, 190)).toBe(ANTICLOCKWISE)
  })
})

describe('CalorieRing', () => {
  it('shows half a green outer ring at half of the positive bank limit', () => {
    const { image, outerProgress, fraction, transform } = renderRing(1_000)

    expect(outerProgress.getAttribute('stroke')).toBe(GREEN)
    expect(fraction).toBeCloseTo(0.5, 6)
    expect(transform).toBe(CLOCKWISE)
    expect(image.getAttribute('aria-label')).toContain('Bank balance +1,000 kcal in surplus')
    expect(image.getAttribute('aria-label')).toContain("filling clockwise from 12 o'clock")
    expect(screen.getByText('Bank +1,000 kcal · 50% of ±2,000 kcal scale')).toBeTruthy()
  })

  it("shows a red third-ring deficit at -650 kcal, sweeping the other way from 12 o'clock", () => {
    const { image, outerProgress, fraction, transform } = renderRing(-650)

    expect(outerProgress.getAttribute('stroke')).toBe(RED)
    expect(fraction).toBeCloseTo(0.325, 6)
    expect(transform).toBe(ANTICLOCKWISE)
    expect(transform?.endsWith(CLOCKWISE)).toBe(true)
    expect(image.getAttribute('aria-label')).toContain("filling anticlockwise from 12 o'clock")
    expect(screen.getByText('Bank -650 kcal · 32.5% of ±2,000 kcal scale')).toBeTruthy()
  })

  it('saturates at the fixed limits without hiding the actual bank balance', () => {
    const positive = renderRing(2_000)
    expect(positive.fraction).toBeCloseTo(1, 6)
    expect(positive.outerProgress.getAttribute('stroke')).toBe(GREEN)

    positive.unmount()
    const aboveLimit = renderRing(3_250)
    expect(aboveLimit.fraction).toBeCloseTo(1, 6)
    expect(screen.getByText('Bank +3,250 kcal · 100% of ±2,000 kcal scale')).toBeTruthy()

    aboveLimit.unmount()
    const deficit = renderRing(-4_460)
    expect(deficit.fraction).toBeCloseTo(1, 6)
    expect(deficit.outerProgress.getAttribute('stroke')).toBe(RED)
    expect(deficit.transform).toBe(ANTICLOCKWISE)
    expect(deficit.image.getAttribute('aria-label')).toContain('Bank balance -4,460 kcal in deficit')
  })

  it('keeps a zero balance neutral and keeps the inner ring on the daily goal', () => {
    const { outerProgress, fraction } = renderRing(0, 1_500, 2_000)

    expect(outerProgress.getAttribute('stroke')).toBe(NEUTRAL)
    expect(fraction).toBe(0)
    expect(screen.getByText('of 2,000 kcal')).toBeTruthy()
    expect(screen.getByText('500 kcal allowance left')).toBeTruthy()
    expect(BANK_RING_LIMIT_KCAL).toBe(2_000)
  })
})
