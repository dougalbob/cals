import { expect, test, type Page } from '@playwright/test'
import { resetFixtures, isoDate, touchTap } from './support'
import { stonesPoundsToKg } from '../src/lib/format'

/**
 * Phase 14.3 on a phone: the weigh-in and goal-vs-consumed charts pan one
 * shared window by dragging the chart itself (decision 69), and the weigh-in
 * trend is labelled with the method and window it actually uses (decision 95).
 *
 * The drags are real touch input through CDP — the same technique the bottom
 * navigation's swipe test uses — because a synthetic mouse drag would exercise
 * the click-and-hold path instead of the phone one.
 */

async function dragChart(page: Page, testId: string, fromRatio: number, toRatio: number) {
  const chart = page.getByTestId(testId)
  const box = (await chart.boundingBox())!
  const y = box.y + box.height / 2
  const fromX = box.x + box.width * fromRatio
  const toX = box.x + box.width * toRatio
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number) => [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }]

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(fromX) })
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(fromX + ((toX - fromX) * step) / 8),
    })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // Let the re-fetch settle before reading the caption.
  await page.waitForTimeout(300)
}

test.describe('Metrics charts pan on a phone', () => {
  test('drags the weigh-in window back, keeps it in the URL and labels the trend', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')

    const caption = page.getByTestId('weight-window')
    await expect(caption).toContainText('Showing')
    const before = (await caption.textContent()) as string

    // Dragging the chart to the right slides the days rightwards, revealing
    // older ones.
    await dragChart(page, 'weight-pan', 0.2, 0.8)
    await expect(caption).not.toHaveText(before)
    const after = (await caption.textContent()) as string

    // The window rides in the URL, so a reload or a deep link reopens it.
    expect(page.url()).toContain('from=')
    expect(page.url()).toContain('to=')
    await page.reload()
    await expect(caption).toHaveText(after)

    // The trend says what it is and which window it uses (decision 95).
    await expect(page.getByTestId('weight-trend-note')).toContainText('7-weigh-in moving average')
  })

  test('pans the goal chart, and the weigh-in chart moves with it', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')

    const weightCaption = page.getByTestId('weight-window')
    const before = (await weightCaption.textContent()) as string
    // Both captions print the same range; the second half of each differs.
    const range = (text: string) => text.replace('Showing ', '').split(' · ')[0]

    await dragChart(page, 'goal-pan', 0.2, 0.8)

    await expect(weightCaption).not.toHaveText(before)
    const weightRange = range((await weightCaption.textContent()) as string)
    const goalRange = range((await page.getByTestId('goal-window').textContent()) as string)
    expect(goalRange).toBe(weightRange)
  })

  test('tapping a chart point briefly reveals its date and weight', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')

    const point = page.getByTestId('line-chart-point-3')
    await expect(point).toBeVisible()
    const value = (await point.getAttribute('aria-label')) as string
    const expected = value.split(': ').slice(1).join(': ')
    await touchTap(point)
    await expect(page.getByTestId('chart-point-status')).toContainText(expected)
    await expect(page.getByTestId('line-chart-point-tooltip')).toContainText(expected)
    await page.waitForTimeout(2600)
    await expect(page.getByTestId('line-chart-point-tooltip')).toHaveCount(0)
  })

  test('records a backdated weigh-in with the preferred stones and pounds fields', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')

    await touchTap(page.getByRole('button', { name: 'Add weigh-in' }))
    const dateInput = page.getByTestId('weigh-in-date')
    await expect(dateInput).toHaveValue(isoDate())
    const delayedDate = isoDate(-125)
    await dateInput.fill(delayedDate)
    await page.getByLabel('Weight in stones').fill('12')
    await page.getByLabel('Weight in pounds').fill('7.1')
    await touchTap(page.getByTestId('save-weigh-in'))
    await expect(page.getByRole('dialog', { name: 'Add weigh-in' })).toHaveCount(0)

    const saved = await request.get(`/api/weight?from=${delayedDate}&to=${delayedDate}`)
    const entries = (await saved.json()) as { date: string; weight_kg: number }[]
    expect(entries).toHaveLength(1)
    expect(entries[0].weight_kg).toBeCloseTo(stonesPoundsToKg(12, 7.1))
    await expect(page.getByTestId('weigh-in-action')).toContainText('Last:')
  })

  test('keeps the weight summary compact and readable on a narrow phone', async ({ page, request }) => {
    await resetFixtures(request)
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/metrics')

    const current = page.getByTestId('weight-stat-current')
    const currentValue = page.getByTestId('weight-stat-current-value')
    await expect(currentValue).toContainText(/\(\d+\.\d kg\)/)

    for (const value of [currentValue, page.getByTestId('weight-stat-delta-value')]) {
      const dimensions = await value.evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        height: element.getBoundingClientRect().height,
      }))
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1)
      expect(dimensions.height).toBeLessThanOrEqual(22)
    }
    await expect(current).toHaveCSS('height', /5[0-9]px/)

    const target = page.getByTestId('weight-stat-target')
    const targetButton = target.getByRole('button')
    const targetDimensions = await targetButton.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.getBoundingClientRect().height,
    }))
    expect(targetDimensions.scrollWidth).toBeLessThanOrEqual(targetDimensions.width + 1)
    expect(targetDimensions.height).toBeLessThanOrEqual(22)

    const weighIn = page.getByTestId('weigh-in-action')
    await expect(weighIn.getByText('Weigh-in', { exact: true })).toHaveCount(0)
    await expect(weighIn.getByRole('button', { name: 'Add weigh-in' })).toBeVisible()
    await expect(weighIn).toContainText(/Last: \d+ [A-Z][a-z]{2}/)
    const weighInHeight = await weighIn.evaluate((element) => element.getBoundingClientRect().height)
    expect(weighInHeight).toBeLessThanOrEqual(60)
  })

  test('saves a target in kilograms and retains the stones/lb switcher', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')

    await touchTap(page.getByRole('button', { name: /Edit target weight/ }))
    await page.getByLabel('Target weight in stones').fill('13')
    await page.getByLabel('Target weight in pounds').fill('2')
    await touchTap(page.getByRole('button', { name: 'Kilograms' }))
    await expect(page.getByLabel('Target weight in kilograms')).toHaveValue('83.5')
    await touchTap(page.getByRole('button', { name: 'Save target' }))
    await expect(page.getByRole('dialog', { name: 'Target weight' })).toHaveCount(0)

    const user = await (await request.get('/api/users/me')).json()
    expect(user.target_weight_kg).toBe(83.5)
  })
})
