import { expect, test } from '@playwright/test'
import { diaryFor, isoDate, resetFixtures, touchTap } from './support'

/**
 * The Recipes tab doubling as a Diary meal's recipe picker (decision 64): the
 * meal and date ride in the URL, every card can log straight to that slot, and
 * finishing returns to the right place in the Diary.
 */

const TODAY = isoDate(0)

test.describe('Recipes as the Diary meal picker', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtures(request)
  })

  test('the Diary hands over the meal and the day, and gets the entry back', async ({ page, request }) => {
    await page.goto(`/diary/${TODAY}`)
    await page.locator('#dinner').getByRole('button', { name: '🍽 Add recipe' }).click()

    // The catalogue says which meal it is filling, and every card offers it.
    const banner = page.getByRole('status', { name: 'Adding a recipe to the diary' })
    await expect(banner).toContainText('Pick a recipe for Dinner')
    const add = page.getByRole('button', { name: `Add Chicken Curry to Dinner on ${TODAY}` })
    await touchTap(add)

    // The sheet arrives pre-filled with the carried meal and date.
    const sheet = page.getByRole('dialog')
    await expect(sheet).toContainText('Going to Dinner · today')
    await page.getByLabel('Weight (grams)').fill('250')
    await page.getByRole('button', { name: 'Add to diary' }).click()
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Logged 250 g to today')
    await page.getByRole('button', { name: 'Done' }).click()

    // Back in the Diary, in the meal the pick started from.
    await expect(page).toHaveURL(new RegExp(`/diary/${TODAY}`))
    const entry = (await diaryFor(request, TODAY)).find((row) => row.recipe_name === 'Chicken Curry')
    expect(entry?.meal).toBe('dinner')
    expect(entry?.quantity_grams).toBe(250)
    await expect(page.locator('#dinner').getByText('Chicken Curry').first()).toBeVisible()
  })

  test('an archived recipe cannot be logged from the picker', async ({ page, request }) => {
    await request.put('/api/recipes/1/archive', { data: { is_archived: true } })
    await page.goto(`/recipes?add-to=lunch&on=${TODAY}`)

    // Archived recipes only appear behind the Archived view; even there the
    // card offers Restore instead of logging (decision 59).
    await page.getByRole('button', { name: 'Archived' }).click()
    await expect(page.getByRole('button', { name: `Add Chicken Curry to Lunch on ${TODAY}` })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Restore Chicken Curry' })).toBeVisible()
  })
})
