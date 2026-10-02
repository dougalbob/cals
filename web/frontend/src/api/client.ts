/**
 * Thin typed fetch wrapper over the cals API.
 *
 * Deliberately small: every call goes through `apiGet`/`apiPost`/`apiPut`/`apiDelete`, so the
 * Cloudflare Access behaviour (and any future auth handling) lives in one place
 * rather than being re-implemented per screen.
 *
 * Cloudflare Access note: when the Access session expires, requests come back
 * as an HTML login page with a 200/302 rather than a JSON 401. Detecting that
 * and reloading to re-authenticate is much friendlier than a JSON parse error.
 */

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class AuthExpiredError extends Error {
  constructor() {
    super('Cloudflare Access session expired — reloading to sign in again')
    this.name = 'AuthExpiredError'
  }
}

let authReloadRequested = false

function reloadForAuthentication() {
  if (typeof window === 'undefined' || authReloadRequested) return
  authReloadRequested = true
  window.location.reload()
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('Content-Type') ?? ''

  // Cloudflare Access served us a login page instead of JSON.
  if (!contentType.includes('application/json') && response.ok) {
    if (contentType.includes('text/html')) {
      // A Cloudflare Access redirect is an HTML login page, not an API response.
      // Reload once through the browser's normal navigation so Access can sign in.
      reloadForAuthentication()
      throw new AuthExpiredError()
    }
    throw new ApiError(`Unexpected response type: ${contentType || 'unknown'}`, response.status)
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    if (contentType.includes('application/json')) {
      const data = (await response.json().catch(() => null)) as { error?: unknown } | null
      if (data && typeof data.error === 'string' && data.error.trim()) message = data.error
    } else {
      const text = await response.text().catch(() => '')
      if (text.trim()) message = text.trim()
    }
    throw new ApiError(message, response.status)
  }

  return (await response.json()) as T
}

export const apiGet = <T>(path: string) => request<T>('GET', path)
export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, body)
export const apiPut = <T>(path: string, body?: unknown) => request<T>('PUT', path, body)
export const apiDelete = <T>(path: string) => request<T>('DELETE', path)

/** Query keys — one place, so mutations always invalidate the right things. */
export const queryKeys = {
  version: ['version'] as const,
  user: ['user'] as const,
  diary: (date: string) => ['diary', date] as const,
  bank: (date: string) => ['bank', date] as const,
  drinks: (date: string) => ['drinks', date] as const,
  drinkDefinitions: ['drink-definitions'] as const,
  water: (date: string) => ['water', date] as const,
  customFoods: ['foods', 'custom'] as const,
  foodSearch: (q: string) => ['foods', 'search', q] as const,
  weight: (days: number) => ['weight', days] as const,
  measurements: ['measurements'] as const,
  calorieStats: (days: number) => ['stats', 'calories', days] as const,
  bankStats: (days: number) => ['stats', 'bank', days] as const,
  nutrition: (days: number) => ['nutrition', 'weekly', days] as const,
}
