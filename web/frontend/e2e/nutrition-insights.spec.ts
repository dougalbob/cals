import { expect, test } from '@playwright/test'
import { resetFixtures } from './support'

/** Exploratory Nutrition additions stay additive and phone-readable. */
test('shows the macro-pattern and density prototypes alongside the existing Nutrition panels', async ({ page, request }) => {
  await resetFixtures(request)
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/nutrition')

  await expect(page.getByRole('heading', { name: /Nutrition — 7 day rolling/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Macro split (7 day avg)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Protein', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fibre', exact: true })).toBeVisible()
  await expect(page.getByTestId('nutrition-daily-table')).toBeVisible()

  await expect(page.getByTestId('nutrition-macro-pattern')).toBeVisible()
  await expect(page.getByTestId('nutrition-density')).toBeVisible()
  await expect(page.getByTestId('nutrition-pattern-coverage')).toContainText('7 of 7 days')

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(pageWidth).toBeLessThanOrEqual(361)
})
