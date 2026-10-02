// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthExpiredError, apiGet } from './client'

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
