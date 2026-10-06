import { expect, test } from '@playwright/test'
import { resetFixtures } from './support'

/**
 * The worker ships unminified (so it is readable in DevTools on the owner's
 * phone), which means its explanatory comments are part of the served text.
 * Assertions therefore run against the code with comments stripped, so a
 * comment that says "no caches.open" cannot make a "does not call caches.open"
 * check fail — or worse, pass for the wrong reason.
 */
function executableSource(worker: string): string {
  return worker.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

test.describe('React PWA installability at /', () => {
  test('serves the app manifest, icons and worker at the root', async ({ request }) => {
    await resetFixtures(request)

    const manifestResponse = await request.get('/manifest.webmanifest')
    expect(manifestResponse.status()).toBe(200)
    expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json')
    const manifest = await manifestResponse.json()
    // All three must be the root. If any of them still pointed at /next/ the
    // install would be scoped to a path the app no longer lives at.
    expect(manifest.id).toBe('/')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      '/pwa/icon-192.png',
      '/pwa/icon-512.png',
    ])

    for (const icon of manifest.icons as { src: string }[]) {
      const response = await request.get(icon.src)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/png')
    }

    const workerResponse = await request.get('/sw.js')
    expect(workerResponse.status()).toBe(200)
    expect(workerResponse.headers()['content-type']).toContain('javascript')
    // Without this header the browser clamps the worker's scope to the
    // directory holding the script.
    expect(workerResponse.headers()['service-worker-allowed']).toBe('/')
  })

  test('the worker has a pass-through fetch handler and no caching', async ({ request }) => {
    await resetFixtures(request)

    const code = executableSource(await (await request.get('/sw.js')).text())

    // Chromium's install-prompt algorithm still requires a fetch handler, which
    // is what makes the in-app "Install app" button on Settings work at all.
    expect(code).toMatch(/addEventListener\(\s*["']fetch["']/)
    // …but decision 53 forbids caching, so it must hand the request straight to
    // the network rather than storing or serving anything. The receiver and
    // argument are matched loosely on purpose: this asserts the *behaviour*
    // (respond with a straight network fetch of the incoming request), not the
    // local variable names the TypeScript happens to compile to.
    expect(code).toMatch(/respondWith\(\s*fetch\(\s*[\w$.]+\.request\s*\)/)
    expect(code).not.toMatch(/precacheAndRoute\s*\(/)
    expect(code).not.toMatch(/caches\s*\.\s*open/)
    expect(code).not.toMatch(/cache\s*\.\s*put/)
  })

  test('the worker controls the root, serves requests and stores nothing', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/diary')

    // Wait until the worker is genuinely active, not merely registered.
    const scope = await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker?.getRegistration('/')
      if (registration?.active?.state !== 'activated') return false
      return new URL(registration.scope).pathname
    })
    expect(await scope.jsonValue()).toBe('/')

    // A real request through the worker still reaches the server.
    const apiStatus = await page.evaluate(async () => (await fetch('/api/version')).status)
    expect(apiStatus).toBe(200)

    // And after serving it, there is still no cache at all: the pass-through
    // stores nothing, so there is nothing to go stale on the next deploy.
    const cacheNames = await page.evaluate(async () => caches.keys())
    expect(cacheNames).toEqual([])
  })

  test('applies the saved device theme before the app first paints', async ({ page, request }) => {
    await resetFixtures(request)
    await page.addInitScript(() => localStorage.setItem('cals.theme', 'midnight'))
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#a29bfe')
  })
})

test.describe('the retired /next/ mount', () => {
  test('redirects by stripping the prefix and keeping the query', async ({ request }) => {
    await resetFixtures(request)

    const cases: [string, string][] = [
      ['/next', '/'],
      ['/next/', '/'],
      ['/next/diary', '/diary'],
      ['/next/diary/2026-10-02', '/diary/2026-10-02'],
      ['/next/settings', '/settings'],
      ['/next/recipes/3', '/recipes/3'],
      // The dev identity switch's ?as= must survive the redirect.
      ['/next/diary?as=someone@example.com', '/diary'],
    ]

    for (const [from, to] of cases) {
      const response = await request.get(from, { maxRedirects: 0 })
      // 308 rather than 301/302 so the method is preserved and browsers stop
      // asking the old path.
      expect(response.status(), `GET ${from}`).toBe(308)
      const location = new URL(response.headers()['location']!, 'http://preview.test')
      expect(location.pathname, `GET ${from}`).toBe(to)
      if (from.includes('?')) {
        // Compared decoded, so the assertion does not depend on how the
        // redirect happens to percent-encode the query.
        expect(location.searchParams.get('as'), `GET ${from}`).toBe('someone@example.com')
      }
    }
  })

  test('an old /next/ deep link still lands on the same screen', async ({ page, request }) => {
    await resetFixtures(request)

    // This is what a bookmark, the Unraid template's WebUI link or a phone
    // home-screen entry recorded at /next/ does after the cutover.
    await page.goto('/next/diary')

    await expect(page).toHaveURL(/\/diary$/)
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  })
})
