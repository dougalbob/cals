import { expect, test } from '@playwright/test'
import { isoDate, resetFixtures, touchTap } from './support'

const TODAY = isoDate(0)

/** Issue #91: the daily portion guide is contextual to opening a recipe. */
test.describe('Recipe daily calorie serving guide', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtures(request)
  })

  test('keeps the recipe catalogue clear and shows a daily-goal estimate on detail', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/recipes')

    const guide = page.getByTestId('recipe-daily-serving-hint')
    await expect(guide).toHaveCount(0)

    await touchTap(page.getByRole('link', { name: 'View Chicken Curry' }))
    await expect(page.getByRole('heading', { name: 'Chicken Curry' })).toBeVisible()
    await expect(guide).toContainText('Suggested serving size')
    await expect(guide).toContainText('kcal left, including food and drinks')
  })

  test('shows the guide when a recipe is selected straight from the Diary picker', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto(`/recipes?add-to=dinner&on=${TODAY}`)

    const guide = page.getByTestId('recipe-daily-serving-hint')
    await expect(guide).toHaveCount(0)
    await touchTap(page.getByRole('button', { name: `Add Chicken Curry to Dinner on ${TODAY}` }))

    const sheet = page.getByRole('dialog', { name: 'Add Chicken Curry to Dinner' })
    await expect(sheet.getByTestId('recipe-daily-serving-hint')).toContainText('Suggested serving size')
  })
})
