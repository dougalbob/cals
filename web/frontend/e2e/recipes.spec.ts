import { expect, test } from '@playwright/test'
import { boxWithinViewport, isoDate, resetFixtures } from './support'

/**
 * The recipe box: the orange "Own creation" origin marker and the catalogue
 * filters that sit on top of it. The marker is the newest Phase 13 surface, so
 * it gets the browser coverage; the recipe maths itself is unit-tested.
 */

const OWN_CREATION = 'Chicken & Mushroom Pie'

test.describe('Recipes: origin marker and catalogue filtering', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/recipes')
    await expect(page.getByRole('link', { name: `View ${OWN_CREATION}` })).toBeVisible()
  })

  test('the marker appears only on the owner-created recipe', async ({ page }) => {
    const ownTags = page.getByRole('group', { name: `${OWN_CREATION} tags` })
    const ownChip = ownTags.getByRole('button', { name: /Own creation/ })
    await expect(ownChip).toBeVisible()
    // The origin marker is the orange one, distinct from the blue occasion/dish
    // and white key-food chips.
    await expect(ownChip).toHaveClass(/orange/)

    const otherTags = page.getByRole('group', { name: 'Chicken Curry tags' })
    await expect(otherTags.getByText('Own creation')).toHaveCount(0)
  })

  test('tapping the marker filters the catalogue to own creations', async ({ page }) => {
    await page.getByRole('button', { name: 'Filter recipes by Own creation' }).click()

    await expect(page.getByRole('link', { name: `View ${OWN_CREATION}` })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'View Salmon Traybake' })).toHaveCount(0)

    // The active filter is removable, and clearing it brings the box back.
    await page.getByRole('button', { name: 'Remove Own creation filter' }).click()
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toBeVisible()
    await expect(page.getByRole('link', { name: `View ${OWN_CREATION}` })).toBeVisible()
  })

  test('Own creation checkbox shares the dish-type row on a phone and composes with tags', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.getByText('Filter by recipe details').click()

    const ownCreation = page.getByRole('checkbox', { name: 'Filter by Own creation' })
    const dishType = page.getByRole('combobox', { name: 'Filter by dish type' })
    await expect(ownCreation).toBeVisible()
    const ownBox = await ownCreation.boundingBox()
    const dishBox = await dishType.boundingBox()
    expect(ownBox && dishBox).toBeTruthy()
    expect(
      Math.abs(
        (ownBox?.y ?? 0) + (ownBox?.height ?? 0) / 2 - ((dishBox?.y ?? 0) + (dishBox?.height ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(2)
    expect(dishBox?.width).toBeLessThan(await page.getByRole('combobox', { name: 'Filter by meal occasion' }).evaluate((element) => element.getBoundingClientRect().width))

    await ownCreation.click()
    await expect(ownCreation).toBeChecked()
    await expect(page.getByRole('link', { name: `View ${OWN_CREATION}` })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toHaveCount(0)

    await dishType.selectOption('main')
    await expect(page.getByRole('link', { name: `View ${OWN_CREATION}` })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove Own creation filter' })).toBeVisible()
  })

  test('the occasion filter narrows the catalogue and clears', async ({ page }) => {
    // The facet selects live behind a collapsed "Filter by recipe details".
    await page.getByText('Filter by recipe details').click()
    await page.getByRole('combobox', { name: 'Filter by meal occasion' }).selectOption('breakfast')

    await expect(page.getByRole('link', { name: 'View Porridge & Berries' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toBeVisible()
  })

  test('the portion sheet keeps Add to diary on screen on a small phone', async ({ page, request }) => {
    await resetFixtures(request)
    // 360×640 is where the action row used to open below the fold: the sheet is
    // taller than the screen and the buttons scrolled with its contents.
    await page.setViewportSize({ width: 360, height: 640 })

    await page.goto(`/recipes?add-to=dinner&on=${isoDate(0)}`)
    await page.getByRole('button', { name: /^Add Chicken Curry to Dinner/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const footer = dialog.locator('[data-modal-footer]')
    await expect(footer).toBeVisible()
    expect(boxWithinViewport(await footer.boundingBox(), page.viewportSize())).toBe(true)
    await expect(footer.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(footer.getByRole('button', { name: 'Add to diary' })).toBeVisible()

    // The sheet content still scrolls behind the fixed actions.
    await dialog.locator('[data-modal-scroll]').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    expect(boxWithinViewport(await footer.boundingBox(), page.viewportSize())).toBe(true)
    await expect(footer.getByRole('button', { name: 'Add to diary' })).toBeInViewport()
  })

  test('the detail page shows the marker and can toggle it', async ({ page, request }) => {
    await page.goto(`/recipes/4`)
    const tagRow = page.getByRole('group', { name: `${OWN_CREATION} tags` })
    await expect(tagRow.getByText('Own creation')).toBeVisible()

    await page.getByRole('button', { name: 'Add tag' }).click()
    const checkbox = page.getByRole('checkbox', { name: 'Own creation' })
    await expect(checkbox).toBeChecked()

    await checkbox.uncheck()
    await page.getByRole('button', { name: 'Save tags and time' }).click()

    // The marker is gone from the page, and the server agrees.
    await expect(tagRow.getByText('Own creation')).toHaveCount(0)
    const response = await request.get('/api/recipes/4')
    expect((await response.json()).is_own_creation).toBe(false)

    // …and it stays gone after a reload, so the write really landed.
    await page.reload()
    await expect(page.getByRole('group', { name: `${OWN_CREATION} tags` }).getByText('Own creation')).toHaveCount(0)
    await page.goto('/recipes')
    await expect(page.getByRole('button', { name: 'Filter recipes by Own creation' })).toHaveCount(0)
  })
})
