// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BANK_RING_LIMIT_KCAL, arcTransform, bankArcTransform, CalorieRing } from './CalorieRing'

const GREEN = '#26de81'
const RED = '#fc5c65'
const NEUTRAL = '#edf2f7'
/** A plain rotation: the arc's dash starts at 12 o'clock and runs forwards (clockwise). */
const CLOCKWISE = 'rotate(-90 95 95)'
/** A reflection about the ring's vertical axis: same 12 o'clock start, mirrored sweep. */
const ANTICLOCKWISE = `translate(190 0) scale(-1 1) ${CLOCKWISE}`

afterEach(cleanup)

function renderRing(
  bankBalance: number,
  consumed = 1_500,
  goal = 2_000,
  limits: { bankSurplusLimitKcal?: number; bankDeficitLimitKcal?: number } = {},
) {
  const view = render(<CalorieRing bankBalance={bankBalance} consumed={consumed} goal={goal} {...limits} />)
  const image = screen.getByRole('img')
  const circles = image.querySelectorAll('circle')
  const outerProgress = circles[1]
  const innerProgress = circles[3]
  if (!outerProgress || !innerProgress) throw new Error('Expected both progress circles')

  const circumference = Number(outerProgress.getAttribute('stroke-dasharray'))
  const offset = Number(outerProgress.getAttribute('stroke-dashoffset'))
  const innerCircumference = Number(innerProgress.getAttribute('stroke-dasharray'))
  const innerOffset = Number(innerProgress.getAttribute('stroke-dashoffset'))

  return {
    image,
    outerProgress,
    innerProgress,
    transform: outerProgress.getAttribute('transform'),
    innerTransform: innerProgress.getAttribute('transform'),
    unmount: view.unmount,
    fraction: 1 - offset / circumference,
    innerFraction: 1 - innerOffset / innerCircumference,
  }
}

describe('arcTransform', () => {
  it("anchors both directions at 12 o'clock and only mirrors the negative sweep", () => {
    expect(arcTransform(1_000, 190)).toBe(CLOCKWISE)
    expect(arcTransform(0, 190)).toBe(CLOCKWISE)
    expect(arcTransform(-1, 190)).toBe(ANTICLOCKWISE)
    expect(arcTransform(-2_000, 190)).toBe(ANTICLOCKWISE)
    // The outer ring keeps its original name.
    expect(bankArcTransform).toBe(arcTransform)
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
    // The hub carries the bank *plus* what is left of today: 1,000 + (2,000 − 1,500).
    expect(screen.getByText('+1,500')).toBeTruthy()
    expect(screen.getByText('1,500')).toBeTruthy()
    expect(screen.getByText('+500')).toBeTruthy()
    // The old captions underneath are gone.
    expect(screen.queryByText(/kcal scale/)).toBeNull()
    expect(screen.queryByText(/allowance left/)).toBeNull()
  })

  it("shows a red third-ring deficit at -650 kcal, sweeping the other way from 12 o'clock", () => {
    const { image, outerProgress, fraction, transform } = renderRing(-650)

    expect(outerProgress.getAttribute('stroke')).toBe(RED)
    expect(fraction).toBeCloseTo(0.325, 6)
    expect(transform).toBe(ANTICLOCKWISE)
    expect(transform?.endsWith(CLOCKWISE)).toBe(true)
    expect(image.getAttribute('aria-label')).toContain("filling anticlockwise from 12 o'clock")
    // −650 bank + 500 left of today = −150 headroom, shown with a true minus sign.
    expect(screen.getByText('−150')).toBeTruthy()
  })

  it('saturates at the fixed limits without hiding the actual bank balance', () => {
    const positive = renderRing(2_000)
    expect(positive.fraction).toBeCloseTo(1, 6)
    expect(positive.outerProgress.getAttribute('stroke')).toBe(GREEN)

    positive.unmount()
    const aboveLimit = renderRing(3_250)
    expect(aboveLimit.fraction).toBeCloseTo(1, 6)
    expect(aboveLimit.image.getAttribute('aria-label')).toContain('100% of its plus 2,000 kcal surplus or minus 2,000 kcal deficit')
    expect(screen.getByText('+3,750')).toBeTruthy()

    aboveLimit.unmount()
    const deficit = renderRing(-4_460)
    expect(deficit.fraction).toBeCloseTo(1, 6)
    expect(deficit.outerProgress.getAttribute('stroke')).toBe(RED)
    expect(deficit.transform).toBe(ANTICLOCKWISE)
    expect(deficit.image.getAttribute('aria-label')).toContain('Bank balance -4,460 kcal in deficit')
  })

  it('uses independent per-user surplus and deficit display limits', () => {
    const limits = { bankSurplusLimitKcal: 1_500, bankDeficitLimitKcal: 1_000 }
    const surplus = renderRing(750, 1_500, 2_000, limits)
    expect(surplus.fraction).toBeCloseTo(0.5, 6)
    expect(surplus.image.getAttribute('aria-label')).toContain('plus 1,500 kcal surplus or minus 1,000 kcal deficit')

    surplus.unmount()
    const deficit = renderRing(-500, 1_500, 2_000, limits)
    expect(deficit.fraction).toBeCloseTo(0.5, 6)
    expect(deficit.outerProgress.getAttribute('stroke')).toBe(RED)

    deficit.unmount()
    // Changing only the positive scale leaves the negative arc on its own limit.
    const independentDeficit = renderRing(-750, 1_500, 2_000, {
      bankSurplusLimitKcal: 3_000,
      bankDeficitLimitKcal: 1_000,
    })
    expect(independentDeficit.fraction).toBeCloseTo(0.75, 6)
  })

  it('keeps a zero balance neutral and keeps the inner ring on the daily goal', () => {
    const { outerProgress, fraction, innerProgress, innerFraction, innerTransform } = renderRing(
      0,
      1_500,
      2_000,
    )

    expect(outerProgress.getAttribute('stroke')).toBe(NEUTRAL)
    expect(fraction).toBe(0)
    // Inner ring counts the allowance down clockwise: 500 of 2,000 left.
    expect(innerProgress.getAttribute('stroke')).toBe(GREEN)
    expect(innerFraction).toBeCloseTo(0.25, 6)
    expect(innerTransform).toBe(CLOCKWISE)
    // Bank 0 + 500 left of today, so both hub lines read +500.
    expect(screen.getAllByText('+500')).toHaveLength(2)
    expect(BANK_RING_LIMIT_KCAL).toBe(2_000)
  })

  it('sweeps the inner ring anticlockwise in red once the day is overspent', () => {
    const { innerProgress, innerFraction, innerTransform, image } = renderRing(0, 2_500, 2_000)

    expect(innerProgress.getAttribute('stroke')).toBe(RED)
    // 500 kcal over a 2,000 kcal goal = a quarter of another day.
    expect(innerFraction).toBeCloseTo(0.25, 6)
    expect(innerTransform).toBe(ANTICLOCKWISE)
    expect(screen.getAllByText('−500')).toHaveLength(2)
    expect(image.getAttribute('aria-label')).toContain('growing anticlockwise')
  })

  it('saturates the inner ring at a whole extra day and never passes it', () => {
    const { innerFraction, innerTransform } = renderRing(0, 6_000, 2_000)

    expect(innerFraction).toBeCloseTo(1, 6)
    expect(innerTransform).toBe(ANTICLOCKWISE)
  })

  it('still shows the bank alone when no daily goal is set', () => {
    renderRing(750, 1_200, 0)

    expect(screen.getByText('+750')).toBeTruthy()
    expect(screen.getByText('daily goal not set')).toBeTruthy()
  })
})
