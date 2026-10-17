import { expect, test } from '@playwright/test'
import { resetFixtures, touchTap } from './support'

/**
 * Issue #97, decision 126: nutrition rating guides. Catalogue cards
 * carry a compact hint (overall + four stars, score inside each);
 * recipe detail carries the full guide with values and band words.
 */
test.describe('Recipe nutrition rating guides', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtures(request)
  })

  test('every catalogue card shows the compact rating hint', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/recipes')

    // All four seeded recipes have a cooked weight and calories.
    await expect(page.getByTestId('recipe-rating-hint')).toHaveCount(4)
  })

  test('the hint scores each recipe from its own densities', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/recipes')

    const curry = page
      .getByRole('article')
      .filter({ has: page.getByRole('link', { name: 'View Chicken Curry' }) })
      .getByTestId('recipe-rating-hint')

    // Chicken Curry: 3.7 g fat, 0.6 g fibre, 12.1 g carbs per 100 g,
    // 0.61 g/kcal → 4, 1, 3, 2 and an overall mean of 2.5.
    await expect(
      curry.getByRole('img', { name: 'Overall: 2.5 out of 5 — the average of the fat, fibre, carbs and volume guides' }),
    ).toBeVisible()
    await expect(
      curry.getByRole('img', { name: 'Fat: 3.7 g/100 g, rated 4 out of 5 — low fat' }),
    ).toBeVisible()
    await expect(
      curry.getByRole('img', { name: 'Fibre: 0.6 g/100 g, rated 1 out of 5 — low fibre' }),
    ).toBeVisible()
    await expect(
      curry.getByRole('img', { name: 'Carbs: 12.1 g/100 g, rated 3 out of 5 — moderate carbs' }),
    ).toBeVisible()
    await expect(
      curry.getByRole('img', { name: 'Volume: 0.6 g/kcal, rated 2 out of 5 — low volume' }),
    ).toBeVisible()

    // Porridge & Berries scores differently, so the hint follows
    // each recipe rather than echoing a fixed template: fat 5,
    // fibre 2 (2.4 g), carbs 3, volume 2 → overall 3.
    const porridge = page
      .getByRole('article')
      .filter({ has: page.getByRole('link', { name: 'View Porridge & Berries' }) })
    await expect(
      porridge.getByRole('img', { name: /Overall: 3 out of 5/ }),
    ).toBeVisible()
    await expect(
      porridge.getByRole('img', { name: /Fat: 2\.2 g\/100 g, rated 5 out of 5 — very low fat/ }),
    ).toBeVisible()
    await expect(
      porridge.getByRole('img', { name: /Fibre: 2\.4 g\/100 g, rated 2 out of 5 — some fibre/ }),
    ).toBeVisible()
  })

  test('recipe detail shows the full guide with values and bands', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/recipes')

    await touchTap(page.getByRole('link', { name: 'View Chicken Curry' }))
    await expect(page.getByRole('heading', { name: 'Chicken Curry' })).toBeVisible()

    const guide = page.getByTestId('recipe-rating-guide')
    await expect(guide).toBeVisible()
    await expect(guide.getByText('Average of the four guides')).toBeVisible()
    await expect(guide.getByText('Low fat')).toBeVisible()
    await expect(guide.getByText('Moderate carbs')).toBeVisible()
    await expect(guide.getByText('Low fibre')).toBeVisible()
    await expect(guide.getByText('Low volume')).toBeVisible()
    await expect(
      guide.getByRole('img', { name: 'Fat: 3.7 g/100 g, rated 4 out of 5 — low fat' }),
    ).toBeVisible()
    await expect(
      guide.getByRole('img', { name: 'Volume: 0.6 g/kcal, rated 2 out of 5 — low volume' }),
    ).toBeVisible()
  })
})
