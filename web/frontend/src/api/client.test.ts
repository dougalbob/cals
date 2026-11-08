// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthExpiredError, apiGet, apiPostForm, apiPut } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('API response handling', () => {
  it('returns JSON responses', async () => {
    const body = { ok: true }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(apiGet<typeof body>('/api/example')).resolves.toEqual(body)
  })

  it('forwards an optional abort signal to fetch for cancellable range reads', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiGet<unknown[]>('/api/weight?from=2026-09-01&to=2026-09-30', {
      signal: controller.signal,
    })).resolves.toEqual([])

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/weight?from=2026-09-01&to=2026-09-30',
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('sends multipart bodies without overriding the browser boundary header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ filename: 'v_abc', updated_at: '2026-10-04T10:00:00Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const body = new FormData()
    body.append('image', new Blob(['photo bytes'], { type: 'image/png' }), 'meal.png')

    await expect(apiPostForm('/api/recipes/7/image', body)).resolves.toMatchObject({ filename: 'v_abc' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.body).toBe(body)
    expect(init.headers).toBeUndefined()
  })

  it('accepts valid JSON when a successful response has the wrong content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"success":true}', {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
      ),
    )

    await expect(apiPut<{ success: boolean }>('/api/diary/7', { quantity_grams: 25 })).resolves.toEqual({
      success: true,
    })
  })

  it('treats an empty successful response as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
      ),
    )

    await expect(apiPut<void>('/api/diary/7', { quantity_grams: 25 })).resolves.toBeUndefined()
  })

  it('reloads once when Cloudflare Access returns an HTML login page', async () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>sign in</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )

    await expect(apiGet('/api/users/me')).rejects.toBeInstanceOf(AuthExpiredError)
    await expect(apiGet('/api/diary')).rejects.toBeInstanceOf(AuthExpiredError)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('uses a JSON API error message and preserves its status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(apiGet('/api/missing')).rejects.toMatchObject({
      message: 'Not found',
      status: 404,
    })
  })
})
