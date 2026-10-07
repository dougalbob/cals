import { expect, test } from '@playwright/test'
import { isoDate, resetFixtures } from './support'

/** Exploratory Nutrition additions stay additive and phone-readable. */
test('shows the macro and density prototypes with target rails and day details', async ({ page, request }) => {
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

  await page.getByTestId('nutrition-focus-chip-carbs').click()
  await expect(page.getByTestId('nutrition-focus-note')).toContainText('45–65%')
  await expect(page.getByTestId('nutrition-focus-rail-carbs').first()).toBeVisible()
  await page.getByTestId('nutrition-focus-chip-fat').click()
  await expect(page.getByTestId('nutrition-focus-rail-fat').first()).toBeVisible()
  await expect(page.getByTestId('nutrition-focus-rail-carbs')).toHaveCount(0)

  await page.getByTestId(`nutrition-day-toggle-${isoDate(-6)}`).click()
  await expect(page.getByTestId('nutrition-day-details')).toBeVisible()
  await expect(page.getByTestId('nutrition-day-details')).toContainText('Breakfast')
  await expect(page.getByTestId('nutrition-day-details').getByTestId('nutrition-diary-item').first()).toContainText('kcal · P')

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(pageWidth).toBeLessThanOrEqual(361)
})
