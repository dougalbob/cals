import { expect, test } from '@playwright/test'
import { recipeAs, resetFixtures, rounded } from './support'

/**
 * The recipe catalogue: search, favourites, filters, archived recipes and the
 * empty states. The origin marker and tag chips have their own spec
 * (recipes.spec.ts); this one covers the rest of the list screen.
 */

test.describe('Recipes catalogue', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/recipes')
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toBeVisible()
  })

  test('search narrows the list and clearing brings it back', async ({ page }) => {
    await expect(page.getByRole('status')).toHaveText('4 recipes')

    await page.getByLabel('Search recipes').fill('porridge')
    await expect(page.getByRole('link', { name: 'View Porridge & Berries' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('1 of 4 recipes match')

    await page.getByLabel('Search recipes').fill('')
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('4 recipes')
  })

  test('a search that matches nothing offers a way back', async ({ page }) => {
    await page.getByLabel('Search recipes').fill('zzzz no such recipe')

    await expect(page.getByText('No recipes match these filters.')).toBeVisible()
    // Two Clear filters buttons exist (the filter card and the empty state).
    await page.getByRole('button', { name: 'Clear filters' }).last().click()
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toBeVisible()
  })

  test('the favourite heart toggles and the Favourites view follows', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Add Chicken Curry to favourites' }).click()

    // The heart belongs to the signed-in user and is remembered by the API.
    await expect(page.getByRole('button', { name: 'Remove Chicken Curry from favourites' })).toBeVisible()
    const favourited = await recipeAs(request, 1)
    expect(favourited.is_favourite).toBe(true)

    await page.getByRole('button', { name: 'Favourites', exact: true }).click()
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Salmon Traybake' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Favourites', exact: true }).click()
    await expect(page.getByRole('link', { name: 'View Salmon Traybake' })).toBeVisible()
  })

  test('the catalogued recipe shows its calorie and time facts', async ({ page, request }) => {
    const curry = await recipeAs(request, 1)
    const card = page.getByRole('link', { name: 'View Chicken Curry' }).locator('xpath=ancestor::article')

    await expect(card.getByText(`${rounded(curry.calories_per_100g)} kcal / 100 g`)).toBeVisible()
    await expect(card.getByText(`Serves ${curry.serves}`)).toBeVisible()
    await expect(card.getByText(`${rounded(curry.total_weight_grams)} g cooked`)).toBeVisible()
    await expect(card.getByText(`${curry.total_time_minutes} min`)).toBeVisible()
  })

  test('archived recipes stay out of the list until asked for', async ({ page, request }) => {
    // The Archived view is disabled while nothing is archived.
    const archivedToggle = page.getByRole('button', { name: 'Archived' })
    await expect(archivedToggle).toBeDisabled()

    await request.put('/api/recipes/2/archive', { data: { is_archived: true } })
    await page.reload()

    await expect(page.getByRole('link', { name: 'View Porridge & Berries' })).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('3 recipes')

    await page.getByRole('button', { name: 'Archived' }).click()
    await expect(page.getByRole('heading', { name: 'Archived recipes (1)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Porridge & Berries' })).toBeVisible()

    // Restoring puts it straight back in the list (the Archived view is still
    // on, and it now has nothing to show).
    await page.getByRole('button', { name: 'Restore Porridge & Berries' }).click()
    await expect(page.getByRole('heading', { name: /^Archived recipes/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'View Porridge & Berries' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('4 recipes')
  })
})
