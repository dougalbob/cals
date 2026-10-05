import { expect, test, type Page } from '@playwright/test'
import { resetFixtures } from './support'

/**
 * The bottom navigation is a five-slot window over eight destinations, revealed
 * by a horizontal swipe or the arrow. The global `touch-action: manipulation`
 * rule for tap reliability must not break that swipe, so both routes are
 * checked here — with real touch input, not a scripted scrollLeft.
 */

async function swipeNav(page: Page, fromX: number, toX: number) {
  const nav = page.getByTestId('primary-navigation-scroll')
  const box = (await nav.boundingBox())!
  const y = box.y + box.height / 2
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number) => [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }]

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(fromX) })
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(fromX + ((toX - fromX) * step) / 6),
    })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)
}

test.describe('Bottom navigation on a phone', () => {
  test('the arrow reveals the last destinations and comes back', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/diary')

    // Five slots are on screen; Foods, Recipes and Settings sit past the right edge.
    const shown = { ratio: 0.5 } as const
    await expect(page.getByRole('link', { name: 'Today' })).toBeInViewport(shown)
    await expect(page.getByRole('link', { name: 'Foods' })).not.toBeInViewport(shown)

    await page.getByRole('button', { name: 'Show Foods, Recipes and Settings' }).click()
    await expect(page.getByRole('link', { name: 'Foods' })).toBeInViewport(shown)
    await expect(page.getByRole('link', { name: 'Recipes' })).toBeInViewport(shown)
    await expect(page.getByRole('link', { name: 'Settings' })).toBeInViewport(shown)

    await page.getByRole('button', { name: 'Show main navigation' }).click()
    await expect(page.getByRole('link', { name: 'Today' })).toBeInViewport(shown)
    await expect(page.getByRole('link', { name: 'Foods' })).not.toBeInViewport(shown)
  })

  test('a horizontal swipe on the nav also reveals them', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/diary')

    const nav = page.getByTestId('primary-navigation-scroll')
    const box = (await nav.boundingBox())!
    expect(await nav.evaluate((element) => element.scrollLeft)).toBe(0)

    await swipeNav(page, box.x + box.width - 30, box.x + 30)

    await expect(page.getByRole('link', { name: 'Recipes' })).toBeInViewport({ ratio: 0.5 })
    expect(await nav.evaluate((element) => element.scrollLeft)).toBeGreaterThan(50)

    // The Back overlay must also let a rightward finger swipe return to Today.
    await swipeNav(page, box.x + 30, box.x + box.width - 30)
    await expect(page.getByRole('link', { name: 'Today' })).toBeInViewport({ ratio: 0.5 })
    await expect(page.getByRole('link', { name: 'Recipes' })).not.toBeInViewport({ ratio: 0.5 })
    expect(await nav.evaluate((element) => element.scrollLeft)).toBeLessThan(50)
  })
})
