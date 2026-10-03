// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthExpiredError, apiGet, apiPut } from './client'

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
