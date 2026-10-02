import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDiaryEntry, deleteDiaryEntry, getBank, getDiary, getDrinkEntries } from './diary'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('typed Diary API client', () => {
  it('gets a date-specific diary through the same-origin API', async () => {
    const body = { date: '2026-10-02', entries: [], totals: { calories: 0 } }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getDiary('2026-10-02')).resolves.toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/diary?date=2026-10-02',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('gets the bank and drink entries for the selected date', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ daily_goal: 2000, bank_balance: 0, today_available: 2000 }))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await getBank('2026-10-02')
    await getDrinkEntries('2026-10-02')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/bank?date=2026-10-02')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/drinks/entries?date=2026-10-02')
  })

  it('creates a diary entry with its date and deletes with the API 204 contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 11, date: '2026-10-02', meal: 'breakfast' }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await createDiaryEntry('2026-10-02', {
      meal: 'breakfast',
      food_id: 7,
      quantity_grams: 100,
    })
    await deleteDiaryEntry(11)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/diary')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ meal: 'breakfast', food_id: 7, quantity_grams: 100, date: '2026-10-02' }),
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/diary/11')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})
