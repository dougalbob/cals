import { expect, test } from '@playwright/test'
import { resetFixtures } from './support'

test.describe('React PWA installability at /next/', () => {
  test('serves a React-specific manifest, icons and an inert network-only worker', async ({ request }) => {
    await resetFixtures(request)

    const manifestResponse = await request.get('/next/manifest.webmanifest')
    expect(manifestResponse.status()).toBe(200)
    expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json')
    const manifest = await manifestResponse.json()
    expect(manifest.start_url).toBe('/next/')
    expect(manifest.scope).toBe('/next/')
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      '/next/pwa/icon-192.png',
      '/next/pwa/icon-512.png',
    ])

    for (const icon of manifest.icons as { src: string }[]) {
      const response = await request.get(icon.src)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/png')
    }

    const workerResponse = await request.get('/next/sw.js')
    expect(workerResponse.status()).toBe(200)
    expect(workerResponse.headers()['service-worker-allowed']).toBe('/next/')
    const worker = await workerResponse.text()
    expect(worker).not.toContain('precacheAndRoute')
    expect(worker).not.toContain('caches.open')
    expect(worker).not.toContain("addEventListener('fetch'")
  })

  test('applies the saved device theme before the app first paints', async ({ page, request }) => {
    await resetFixtures(request)
    await page.addInitScript(() => localStorage.setItem('cals.theme', 'midnight'))
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#a29bfe')
  })

  test('registers the worker with scope limited to /next/', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/diary')

    const scope = await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker?.getRegistration('/next/')
      return registration?.scope ?? false
    })
    expect(await scope.jsonValue()).toContain('/next/')
  })
})
