import { expect, test, type Page } from '@playwright/test'
import { resetFixtures } from './support'

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
})
