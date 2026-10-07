import { expect, test } from '@playwright/test'
import { resetFixtures, touchTap } from './support'

/**
 * The reminders bell on a phone (decisions 121–122).
 *
 * Three journeys, each proving one half of the contract: the weekly-report
 * advisory appears for a completed week and clears when the report is actually
 * viewed (the server-side watermark), the bell follows the acting user after
 * the Admin swap, and a cadence nag clears the moment its data is logged —
 * with no dismissal path offered at all.
 */

test.describe('Reminders bell on a phone', () => {
  test('offers the completed weekly report and clears it once viewed', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/')

    // The primary fixture account weighed and measured recently: only the
    // report advisory is due, badge and all.
    const bell = page.getByTestId('reminders-bell')
    await expect(page.getByTestId('reminders-badge')).toHaveText('1')
    await expect(bell).toHaveAttribute('aria-label', 'Reminders, 1 need attention')

    await touchTap(bell)
    await expect(page.getByTestId('reminder-weekly_report')).toContainText('Weekly report ready')
    await expect(page.getByTestId('reminder-weekly_report')).toContainText('is complete')
    await expect(page.getByTestId('reminder-weigh_in')).toHaveCount(0)
    await expect(page.getByTestId('reminder-body_measurements')).toHaveCount(0)

    await touchTap(page.getByTestId('reminder-action-weekly_report'))
    await expect(page).toHaveURL(/report=week&report_anchor=/)
    // The report card is on the completed week — never "so far".
    await expect(page.getByTestId('report-range')).not.toContainText('so far')

    // Viewing it wrote the watermark: the advisory is gone on this device and
    // every other, and the empty bell says so.
    await expect(bell).toHaveAttribute('aria-label', 'Reminders')
    await expect(page.getByTestId('reminders-badge')).toHaveCount(0)
    await touchTap(bell)
    await expect(page.getByTestId('reminders-all-clear')).toBeVisible()
  })

  test('the bell follows the acting user: swapping shows her three nags', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/')

    await touchTap(page.getByTestId('swap-user-button'))
    await touchTap(page.getByRole('button', { name: /Sarah/ }))
    await expect(page.getByTestId('viewing-as-banner')).toBeVisible()

    // Sarah is behind on both cadences and has not read her report: three.
    await expect(page.getByTestId('reminders-badge')).toHaveText('3')
    const bell = page.getByTestId('reminders-bell')
    await touchTap(bell)
    await expect(page.getByTestId('reminder-weigh_in')).toContainText('Time to weigh in')
    await expect(page.getByTestId('reminder-body_measurements')).toContainText('Time for body measurements')
    await expect(page.getByTestId('reminder-weekly_report')).toContainText('Weekly report ready')

    // The weigh-in action deep-links to Metrics with the entry sheet open,
    // and closing it leaves the URL clean.
    await touchTap(page.getByTestId('reminder-action-weigh_in'))
    await expect(page.getByTestId('weigh-in-sheet')).toBeVisible()
    await expect(page).toHaveURL(/open=weigh-in/)
    await touchTap(page.getByRole('button', { name: 'Cancel' }))
    await expect(page.getByTestId('weigh-in-sheet')).toHaveCount(0)
    await expect(page).toHaveURL(/\/metrics$/)
  })

  test('logging the weigh-in clears its nag — the data is the only dismissal', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/')

    await touchTap(page.getByTestId('swap-user-button'))
    await touchTap(page.getByRole('button', { name: /Sarah/ }))
    await expect(page.getByTestId('reminders-badge')).toHaveText('3')

    await touchTap(page.getByTestId('reminders-bell'))
    await touchTap(page.getByTestId('reminder-action-weigh_in'))
    await expect(page.getByTestId('weigh-in-sheet')).toBeVisible()

    await page.getByLabel('Weight in stones').fill('11')
    await page.getByLabel('Weight in pounds').fill('2.4')
    await touchTap(page.getByTestId('save-weigh-in'))

    // The sheet closes, the bell drops to two, and the weigh-in item is gone —
    // no "dismiss" button ever existed.
    await expect(page.getByTestId('weigh-in-sheet')).toHaveCount(0)
    await expect(page.getByTestId('reminders-badge')).toHaveText('2')
    await touchTap(page.getByTestId('reminders-bell'))
    await expect(page.getByTestId('reminder-weigh_in')).toHaveCount(0)
    await expect(page.getByTestId('reminder-body_measurements')).toBeVisible()
    await expect(page.getByTestId('reminder-action-weigh_in')).toHaveCount(0)
  })
})
