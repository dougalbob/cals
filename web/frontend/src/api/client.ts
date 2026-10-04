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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  bodyFormat: 'json' | 'form' = 'json',
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined || bodyFormat === 'form'
      ? undefined
      : { 'Content-Type': 'application/json' },
    // The browser must set multipart/form-data's boundary itself. JSON writes
    // continue to use one consistent Content-Type through this client.
    body: body === undefined
      ? undefined
      : bodyFormat === 'form'
        ? body as BodyInit
        : JSON.stringify(body),
  })

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('Content-Type') ?? ''
  const normalizedContentType = contentType.toLowerCase()
  const isJson =
    normalizedContentType.includes('application/json') || normalizedContentType.includes('+json')

  // Cloudflare Access served us a login page instead of JSON. Keep this check
  // ahead of parsing: a 200 HTML login page is not a successful API response.
  if (response.ok && normalizedContentType.includes('text/html')) {
    reloadForAuthentication()
    throw new AuthExpiredError()
  }

  const text = await response.text()

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    if (isJson) {
      let data: { error?: unknown } | null = null
      try {
        data = JSON.parse(text) as { error?: unknown }
      } catch {
        // Keep the generic status message for malformed JSON error responses.
      }
      if (data && typeof data.error === 'string' && data.error.trim()) message = data.error
    } else if (text.trim()) {
      message = text.trim()
    }
    throw new ApiError(message, response.status)
  }

  // A successful mutation may legitimately have no body. Likewise, accept
  // valid JSON from a 2xx response even if a handler forgot its JSON header;
  // this prevents a false client-side failure after the server already wrote.
  if (text.trim() === '') return undefined as T

  try {
    return JSON.parse(text) as T
  } catch {
    if (!isJson) {
      throw new ApiError(`Unexpected response type: ${contentType || 'unknown'}`, response.status)
    }
    throw new ApiError('Invalid JSON response', response.status)
  }
}

export const apiGet = <T>(path: string) => request<T>('GET', path)
export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, body)
export const apiPostForm = <T>(path: string, body: FormData) => request<T>('POST', path, body, 'form')
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
  /** Prefix key: invalidating it refreshes every food search. */
  foodSearchAll: ['foods', 'search'] as const,
  recipes: ['recipes'] as const,
  recipe: (id: number) => ['recipes', 'detail', id] as const,
  /** Calendar range — keyed by (from, to). */
  calendar: (from: string, to: string) => ['calendar', from, to] as const,
  weight: (days: number) => ['weight', days] as const,
  measurements: ['measurements'] as const,
  calorieStats: (days: number) => ['stats', 'calories', days] as const,
  bankStats: (days: number) => ['stats', 'bank', days] as const,
  nutrition: (days: number) => ['nutrition', 'weekly', days] as const,
}
