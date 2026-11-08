import { expect, test, type Page } from '@playwright/test'
import { resetFixtures, touchTap } from './support'

/**
 * Phone tap behaviour on the tick-box controls the owner reported as "not
 * responding": the Add tag form on a recipe and the portion sheet.
 *
 * Two things are checked, because two different browser behaviours can swallow
 * a tap that a desktop mouse never notices:
 *
 *  1. the tap itself must register — every control is tapped for real with
 *     `touchscreen`, on the box and again on the text beside it;
 *  2. the row must be built so the browser does not reinterpret the tap as
 *     something else: `touch-action: manipulation` (no double-tap-zoom delay)
 *     and no text selection / long-press callout on tick-box rows, while real
 *     text inputs stay selectable.
 *
 * Headless Chromium cannot reproduce Android's selection popup itself, so (2)
 * asserts the CSS that stops Android offering it in the first place.
 */

/** The clickable row around a tick-box, as the browser computes its styles. */
function rowStyles(page: Page, name: string) {
  return page
    .getByRole('checkbox', { name })
    .evaluate((input) => {
      const label = input.closest('label')
      const inputStyle = getComputedStyle(input)
      if (!label) return null
      const labelStyle = getComputedStyle(label)
      return {
        inputTouchAction: inputStyle.touchAction,
        labelUserSelect: labelStyle.userSelect,
        labelWebkitUserSelect: labelStyle.webkitUserSelect,
      }
    })
}

test.describe('Recipe tick-boxes on a phone', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtures(request)
  })

  test('every Add tag tick-box answers a touch tap, on the box and on its text', async ({ page }) => {
    await page.goto('/recipes/1')
    await page.getByRole('button', { name: 'Add tag' }).click()

    // Tapping the box itself. (Breakfast starts unticked on this recipe;
    // Lunch and Dinner are already on.)
    const breakfast = page.getByRole('checkbox', { name: 'Breakfast' })
    await touchTap(breakfast)
    await expect(breakfast).toBeChecked()

    // Tapping the text beside it — the usual aim on a phone — on, then off.
    const snack = page.getByRole('checkbox', { name: 'Snack' })
    const snackText = page.locator('label', { hasText: 'Snack' }).first()
    await touchTap(snackText)
    await expect(snack).toBeChecked()
    await touchTap(snackText)
    await expect(snack).not.toBeChecked()

    // The orange origin box and the key-food boxes behave the same way.
    const own = page.getByRole('checkbox', { name: 'Own creation' })
    await touchTap(own)
    await expect(own).toBeChecked()
    await touchTap(own)
    await expect(own).not.toBeChecked()

    const chicken = page.getByRole('checkbox', { name: 'Chicken Breast, grilled' })
    await touchTap(chicken)
    await expect(chicken).not.toBeChecked()
    await touchTap(chicken)
    await expect(chicken).toBeChecked()

    // And the whole set still saves after being driven by touch alone.
    await page.getByRole('button', { name: 'Save tags and time' }).click()
    await expect(page.getByRole('group', { name: 'Chicken Curry tags' }).getByText('Breakfast')).toBeVisible()
  })

  test('the recipe-details Own creation filter answers a touch tap on box and text', async ({ page }) => {
    await page.goto('/recipes')
    await page.getByText('Filter by recipe details').click()

    const own = page.getByRole('checkbox', { name: 'Filter by Own creation' })
    const ownLabel = page.locator('label').filter({ has: own })
    await touchTap(own)
    await expect(own).toBeChecked()
    await touchTap(ownLabel.getByText('Own creation'))
    await expect(own).not.toBeChecked()

    const styles = await rowStyles(page, 'Filter by Own creation')
    expect(styles?.inputTouchAction).toBe('manipulation')
    expect(styles?.labelUserSelect).toBe('none')
    expect(styles?.labelWebkitUserSelect).toBe('none')
  })

  test('the portion sheet tick-box answers a touch tap', async ({ page }) => {
    await page.goto('/recipes/3')
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()

    await page.getByLabel('Weight (grams)').fill('200')
    const makeUsual = page.getByRole('checkbox', { name: 'Make this my usual portion' })
    await touchTap(makeUsual)
    await expect(makeUsual).toBeChecked()
    await touchTap(makeUsual)
    await expect(makeUsual).not.toBeChecked()
  })

  test('tick-box rows resist selection and double-tap zoom', async ({ page }) => {
    await page.goto('/recipes/1')
    await page.getByRole('button', { name: 'Add tag' }).click()

    for (const name of ['Breakfast', 'Own creation', 'Chicken Breast, grilled']) {
      const styles = await rowStyles(page, name)
      expect(styles, `${name}: a label wraps the tick-box`).not.toBeNull()
      expect(styles!.inputTouchAction, `${name}: touch-action`).toBe('manipulation')
      expect(styles!.labelUserSelect, `${name}: user-select`).toBe('none')
      expect(styles!.labelWebkitUserSelect, `${name}: -webkit-user-select`).toBe('none')
      // -webkit-touch-callout (iOS) is set alongside it but Chromium reports it
      // as an empty computed value, so it is not asserted here.
    }
  })

  test('text fields are still selectable', async ({ page }) => {
    await page.goto('/recipes/1')
    await page.getByRole('button', { name: 'Add tag' }).click()

    // Chromium reports a text field's `user-select` as `auto`; the point is that
    // it is not switched off along with the tick-box rows.
    const selectable = (input: HTMLElement) => {
      const style = getComputedStyle(input)
      return { userSelect: style.userSelect, touchAction: style.touchAction }
    }

    const time = page.getByLabel('Total prep-to-plate time (minutes)')
    const timeStyle = await time.evaluate(selectable)
    expect(timeStyle.userSelect).not.toBe('none')
    expect(timeStyle.touchAction).toBe('manipulation')

    await page.goto('/recipes/3')
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()
    expect((await page.getByLabel('Weight (grams)').evaluate(selectable)).userSelect).not.toBe('none')
  })
})
