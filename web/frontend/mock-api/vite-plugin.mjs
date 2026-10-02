/**
 * Vite plugin that serves the fixture API (mock-api/handler.mjs) as
 * same-origin `/api/*` routes during `vite dev` and `vite preview`.
 *
 * Why a plugin rather than a separate mock server: the seam in the real app is
 * "same-origin /api/*", so mounting the fixtures there means the browser code
 * needs no base-URL configuration and can talk to the real Go server unchanged
 * when VITE_API_TARGET is set. It also means one process to manage.
 */
import { handle } from './handler.mjs'

function middleware() {
  return async (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    if (!url.pathname.startsWith('/api/')) return next()

    // Read the request body for mutations.
    let body = null
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw) {
        try {
          body = JSON.parse(raw)
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'invalid JSON body' }))
          return
        }
      }
    }

    let result
    try {
      result = handle(req.method ?? 'GET', url, body)
    } catch (error) {
      console.error('[fixture-api] handler error:', error)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: String(error) }))
      return
    }

    if (!result) return next()

    res.statusCode = result.status
    res.setHeader('Content-Type', result.contentType ?? 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
  }
}

export function fixtureApi() {
  return {
    name: 'cals-fixture-api',
    configureServer(server) {
      server.middlewares.use(middleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware())
    },
  }
}
