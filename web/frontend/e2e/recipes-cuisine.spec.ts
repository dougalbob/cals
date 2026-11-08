import { expect, test, type Page } from '@playwright/test'
import { resetFixtures, touchTap } from './support'

/**
 * Recipe cuisine on a phone (issue #90, decision 123).
 *
 * The chips are the whole feature — they must answer a real touch tap, stay
 * tall enough to hit, and not push the recipe card wider than a 360 px screen.
 * Everything else here is the round trip: set it on the recipe card, see it on
 * the catalogue card, filter the catalogue by it.
 */

/** Nothing may overflow a 360 px viewport horizontally. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('Recipe cuisine on a phone', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtures(request)
  })

  test('the recipe card’s selector sets, saves and clears a cuisine', async ({ page }) => {
    await page.goto('/recipes/1')
    await expect(page.getByRole('heading', { name: 'Chicken Curry' })).toBeVisible()

    await page.getByRole('button', { name: 'Add tag' }).click()
    const cuisine = page.getByRole('group', { name: 'Cuisine' })
    // The recipe's own cuisine is already selected, so it is one tap to change
    // and one tap to remove.
    await expect(cuisine.getByRole('button', { name: 'Remove the Indian cuisine' })).toBeVisible()

    await touchTap(cuisine.getByRole('button', { name: 'Set the cuisine to Thai' }))
    await page.getByRole('button', { name: 'Save tags and time' }).click()

    await expect(page.getByRole('group', { name: 'Chicken Curry tags' })).toContainText('Thai')
    await expect(page.getByRole('group', { name: 'Chicken Curry tags' })).not.toContainText('Indian')
    // It survived the round trip, not just this page's state.
    await page.reload()
    await expect(page.getByRole('group', { name: 'Chicken Curry tags' })).toContainText('Thai')

    await page.getByRole('button', { name: 'Add tag' }).click()
    await touchTap(cuisine.getByRole('button', { name: 'Remove the Thai cuisine' }))
    await page.getByRole('button', { name: 'Save tags and time' }).click()
    await expect(page.getByRole('group', { name: 'Chicken Curry tags' })).not.toContainText('Thai')
  })

  test('“New…” creates a cuisine that is not listed', async ({ page }) => {
    await page.goto('/recipes/1')
    await page.getByRole('button', { name: 'Add tag' }).click()

    await page.getByRole('button', { name: 'Add a cuisine that is not listed' }).click()
    await page.getByRole('textbox', { name: 'New cuisine' }).fill('Peruvian')
    await page.getByRole('button', { name: 'Add cuisine' }).click()
    await page.getByRole('button', { name: 'Save tags and time' }).click()

    await expect(page.getByRole('group', { name: 'Chicken Curry tags' })).toContainText('Peruvian')

    // The new cuisine is now offered to every other recipe as a chip.
    await page.goto('/recipes/3')
    await page.getByRole('button', { name: 'Add tag' }).click()
    await expect(
      page.getByRole('group', { name: 'Cuisine' }).getByRole('button', { name: 'Set the cuisine to Peruvian' }),
    ).toBeVisible()
  })

  test('the catalogue filters by cuisine, from a card chip and the dropdown', async ({ page }) => {
    await page.goto('/recipes')
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible()

    const curryCard = page.locator('article', { hasText: 'Chicken Curry' }).first()
    await touchTap(curryCard.getByRole('button', { name: 'Filter recipes by Indian' }))

    await expect(page).toHaveURL(/tags=cuisine%3Aindian/)
    await expect(page.getByText('Chicken Curry')).toBeVisible()
    await expect(page.getByText('Salmon Traybake')).toHaveCount(0)
    await expect(page.getByText('1 of 4 recipes match')).toBeVisible()

    // A cuisine shared by two recipes narrows to both of them, and the
    // dropdown is the same filter by the same key.
    await page.getByText('Filter by recipe details').click()
    await page.getByRole('combobox', { name: 'Filter by cuisine' }).selectOption('cuisine:english')
    await expect(page.getByText('Porridge & Berries')).toBeVisible()
    await expect(page.getByText('Chicken & Mushroom Pie')).toBeVisible()
    await expect(page.getByText('2 of 4 recipes match')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('the chip row fits a 360 px screen and every chip is a 44 px target', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto('/recipes/1')
    await page.getByRole('button', { name: 'Add tag' }).click()

    const cuisine = page.getByRole('group', { name: 'Cuisine' })
    await expect(cuisine.getByRole('button', { name: 'Set the cuisine to Italian' })).toBeVisible()

    const heights = await cuisine
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))
    expect(heights.length).toBeGreaterThanOrEqual(8)
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44)

    await expectNoHorizontalOverflow(page)

    // Adding a cuisine keeps the form inside the screen too.
    await page.getByRole('button', { name: 'Add a cuisine that is not listed' }).click()
    await expectNoHorizontalOverflow(page)
  })
})
