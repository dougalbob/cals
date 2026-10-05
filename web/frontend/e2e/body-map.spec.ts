import { expect, test } from '@playwright/test'
import { isoDate, resetFixtures, touchTap } from './support'

/** The app renders history dates with formatShortDate ("2 Oct"). */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  )
}

/**
 * Phase 14.4 on a phone: the body map asks once which outline fits (decision
 * 97), tapping a point opens the pop-up pre-filled with the last value
 * (decision 67), saving records today's measurement without wiping the other
 * parts of the day (decision 96), and the two confirmations appear with their
 * exact wording when they should.
 */

test.describe('Body-map measurements on a phone', () => {
  test('picks an outline, records a waist, and preserves the rest of the history', async ({
    page,
    request,
  }) => {
    await resetFixtures(request)
    await page.goto('/metrics')

    // The fixture's primary account has not chosen an outline yet.
    const picker = page.getByTestId('outline-picker')
    await expect(picker).toBeVisible()
    await touchTap(page.getByTestId('outline-male'))

    // The map appears, and the waist point knows its last recorded value.
    const waistPoint = page.getByTestId('body-point-waist_cm')
    await expect(waistPoint).toBeVisible()
    await expect(waistPoint).toHaveAttribute('aria-label', /98\.2 cm/)
    // Male outline: Chest point, no Bust point (decision 98).
    await expect(page.getByTestId('body-point-chest_cm')).toBeVisible()
    await expect(page.getByTestId('body-point-bust_cm')).toHaveCount(0)

    // Tap the point: the pop-up opens pre-filled with the last value.
    await touchTap(waistPoint)
    const input = page.getByTestId('measurement-input')
    await expect(input).toHaveValue('98.2')
    await expect(page.getByTestId('latest-value')).toContainText('98.2 cm')

    // Step once (0.5 cm, decision 99) and save.
    await touchTap(page.getByTestId('step-up'))
    await expect(input).toHaveValue('98.7')
    await touchTap(page.getByTestId('save-measurement'))

    // Today's row shows up in the history with only the part just recorded…
    const history = page.getByTestId('measurement-history')
    await expect(history).toContainText(shortDate(isoDate()))
    await expect(history).toContainText('Waist 98.7')

    // …and the server still holds every other part of the day the seed
    // recorded three days earlier — the merge wiped nothing.
    const list = await (await request.get('/api/measurements')).json()
    const earlier = list.find(
      (row: { date: string }) => row.date === isoDate(-3),
    ) as Record<string, unknown>
    expect(earlier).toBeTruthy()
    expect(earlier.waist_cm).toBe(98.2)
    expect(earlier.chest_cm).toBe(107.4)
    expect(earlier.hips_cm).toBe(102.8)
    expect(earlier.neck_cm).toBe(39.8)
    const todays = list.find((row: { date: string }) => row.date === isoDate()) as Record<
      string,
      unknown
    >
    expect(todays.waist_cm).toBe(98.7)
  })

  test('saving an unchanged value asks whether that is really correct', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')
    await touchTap(page.getByTestId('outline-male'))

    await touchTap(page.getByTestId('body-point-waist_cm'))
    // Save straight away — the field still holds the last recorded value.
    await touchTap(page.getByTestId('save-measurement'))

    await expect(page.getByTestId('confirm-unchanged-text')).toHaveText(
      "Measurement hasn't changed — is this correct?",
    )
    await touchTap(page.getByTestId('confirm-save-anyway'))

    // The confirmation committed today's row.
    const list = await (await request.get('/api/measurements')).json()
    const todays = list.find((row: { date: string }) => row.date === isoDate()) as Record<
      string,
      unknown
    >
    expect(todays.waist_cm).toBe(98.2)
  })

  test('cancelling with an unsaved change warns first', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')
    await touchTap(page.getByTestId('outline-male'))

    await touchTap(page.getByTestId('body-point-neck_cm'))
    const input = page.getByTestId('measurement-input')
    await expect(input).toHaveValue('39.8')
    await input.fill('41.5')

    await touchTap(page.getByRole('button', { name: 'Cancel' }))
    await expect(page.getByTestId('confirm-discard-text')).toHaveText(
      'You have an unsaved measurement. Discard it?',
    )

    // Keep editing returns to the sheet with the typed value intact.
    await touchTap(page.getByRole('button', { name: 'Keep editing' }))
    await expect(input).toHaveValue('41.5')

    // Discarding closes without writing anything.
    await touchTap(page.getByRole('button', { name: 'Cancel' }))
    await touchTap(page.getByTestId('confirm-discard'))
    await expect(page.getByTestId('measurement-input')).toHaveCount(0)

    const list = await (await request.get('/api/measurements')).json()
    expect(list.some((row: { date: string }) => row.date === isoDate())).toBe(false)
  })

  test('a row from the history opens for correction and keeps its date', async ({
    page,
    request,
  }) => {
    await resetFixtures(request)
    await page.goto('/metrics')
    await touchTap(page.getByTestId('outline-male'))

    // The newest seeded session is three days back; open it from the history.
    const rows = page.getByTestId('measurement-history-row')
    await expect(rows.first()).toContainText(shortDate(isoDate(-3)))
    await touchTap(rows.first())
    await expect(page.getByRole('dialog')).toContainText('Edit')

    // Correct that session's waist and save through the PUT path.
    const waist = page.getByRole('spinbutton', { name: 'Waist in centimetres' })
    await expect(waist).toHaveValue('98.2')
    await waist.fill('97.9')
    await touchTap(page.getByTestId('save-entry-changes'))

    // The correction lands on the entry's own date — history is not moved.
    const list = await (await request.get('/api/measurements')).json()
    const corrected = list.find((row: { date: string }) => row.date === isoDate(-3)) as Record<
      string,
      unknown
    >
    expect(corrected.waist_cm).toBe(97.9)
    expect(corrected.chest_cm).toBe(107.4)
    expect(list.some((row: { date: string }) => row.date === isoDate())).toBe(false)
  })
})
