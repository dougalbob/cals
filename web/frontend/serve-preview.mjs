#!/usr/bin/env node
/**
 * Zero-dependency preview server for the cals frontend spike.
 *
 * Why this exists: a Vite dev server needs `node_modules`, which is excluded
 * from Arena workspace snapshots, so every new session had to reinstall
 * dependencies (~3 s of `npm ci` in the current sandbox) before the preview could start — and any
 * "Restart" of the preview from before that failed outright with
 * `sh: 1: vite: not found`.
 *
 * This server needs nothing but Node itself:
 *   - serves the pre-built static bundle from ./preview/
 *   - implements the fixture API in-process (mock-api/handler.mjs, also
 *     dependency-free) on the same origin, so the app's /api/* calls resolve
 *   - falls back to index.html for client-side routes (deep links)
 *
 * Consequence: restarting the preview takes milliseconds, whatever state the
 * sandbox is in. Building `preview/` still needs Vite (see
 * `npm run build:preview`), but the built output lives in a snapshotted
 * directory, so it survives between turns.
 *
 * Usage:  node serve-preview.mjs        (PORT and HOST are honoured)
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handle } from './mock-api/handler.mjs'
import { parseRequestBody } from './mock-api/request-body.mjs'

const ROOT = resolve(fileURLToPath(new URL('./preview/', import.meta.url)))
const PORT = Number(process.env.PORT ?? 5173)
const HOST = process.env.HOST ?? '0.0.0.0'
const APP_VERSION = '1.7.0-spike'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

async function sendFile(res, filePath, { method }) {
  const info = await stat(filePath)
  if (!info.isFile()) return false

  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  // Vite emits content-hashed filenames under /assets, so those can be cached
  // hard; index.html must never be, or a redeploy would serve a stale shell.
  const immutable = filePath.includes(`${sep}assets${sep}`)
  res.setHeader('Content-Type', type)
  res.setHeader(
    'Cache-Control',
    immutable ? 'public, max-age=31536000, immutable' : 'no-store, must-revalidate',
  )

  if (method === 'HEAD') {
    res.setHeader('Content-Length', info.size)
    res.statusCode = 200
    res.end()
    return true
  }

  const body = await readFile(filePath)
  res.statusCode = 200
  res.end(body)
  return true
}

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  // ---- fixture API, same origin as the app -------------------------------
  if (url.pathname.startsWith('/api/')) {
    let body = null
    if (method === 'POST' || method === 'PUT') {
      body = await parseRequestBody(req)
      if (body === undefined) {
        res.statusCode = 400
        res.setHeader('Content-Type', MIME['.json'])
        res.end(JSON.stringify({ error: 'invalid request body' }))
        return
      }
    }

    try {
      const result = handle(method, url, body, req.headers)
      if (!result) {
        res.statusCode = 404
        res.setHeader('Content-Type', MIME['.json'])
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }
      res.statusCode = result.status
      res.setHeader('Content-Type', result.contentType ?? MIME['.json'])
      res.setHeader('Cache-Control', 'no-store')
      for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value)
      res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
      return
    } catch (error) {
      console.error('[preview] fixture handler error:', error)
      res.statusCode = 500
      res.setHeader('Content-Type', MIME['.json'])
      res.end(JSON.stringify({ error: String(error) }))
      return
    }
  }

  // ---- static assets -----------------------------------------------------
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    pathname = url.pathname
  }

  // The app is deliberately reviewed at its production mount point, which since
  // the Phase 16 cutover is the root. The retired /next/ mount is mirrored here
  // too, so a stale bookmark or an old /next/ start URL behaves in the preview
  // exactly as it does against the Go server: 308, prefix stripped, query kept.
  if (pathname === '/next' || pathname.startsWith('/next/')) {
    const target = pathname.slice('/next'.length) || '/'
    res.writeHead(308, { Location: `${target}${url.search}` })
    res.end()
    return
  }

  // The legacy vanilla UI lives in web/templates + web/static + web/public and
  // is served by the Go handler at /legacy/, which this fixture server does not
  // emulate: cmd/server/frontend_test.go covers that handler instead, because a
  // test against an emulation would not test the code that ships.
  if (pathname === '/legacy' || pathname.startsWith('/legacy/')) {
    res.statusCode = 404
    res.setHeader('Content-Type', MIME['.txt'])
    res.end('The legacy lifeboat is served by the Go server, not this fixture preview.')
    return
  }

  const relativePath = pathname.replace(/^\/+/, '')
  const candidate = resolve(join(ROOT, relativePath))
  // Mirror the Go handler's Service-Worker-Allowed for the root worker.
  if (relativePath === 'sw.js') res.setHeader('Service-Worker-Allowed', '/')
  // Refuse to serve anything outside the build directory.
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  try {
    if (candidate !== ROOT && (await sendFile(res, candidate, { method }))) return
  } catch {
    // fall through to the SPA fallback below
  }

  // Unknown file-like URLs are missing assets, not client-side routes — the same
  // rule the Go handler applies, so a typo'd asset URL cannot be masked here.
  if (extname(pathname)) {
    res.statusCode = 404
    res.setHeader('Content-Type', MIME['.txt'])
    res.end('Not found')
    return
  }

  // SPA fallback: any extension-less path is a client-side route.
  try {
    if (await sendFile(res, join(ROOT, 'index.html'), { method })) return
  } catch {
    // no build present
  }

  res.statusCode = 404
  res.setHeader('Content-Type', MIME['.txt'])
  res.end('Not found')
})

server.listen(PORT, HOST, () => {
  console.log(`cals preview (static + fixtures) v${APP_VERSION}`)
  console.log(`  http://localhost:${PORT}/`)
  console.log(`  serving   ${ROOT}`)
  if (process.env.VITE_API_TARGET) {
    console.log(
      `  note: VITE_API_TARGET is set, but this standalone server always uses the fixture API.` +
        `\n        Use \`npm run dev\` if you need the proxy to a real Go server.`,
    )
  }
})
