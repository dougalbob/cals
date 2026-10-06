import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isRetiredCacheName,
  isRetiredWorkerScript,
  retireReplacedServiceWorkers,
} from './legacyServiceWorker'

/** Minimal stand-in for a ServiceWorkerRegistration. */
function registration(scriptURL: string) {
  const unregister = vi.fn().mockResolvedValue(true)
  return { registration: { active: { scriptURL }, unregister }, unregister }
}

function stubServiceWorker(registrations: unknown[]) {
  const getRegistrations = vi.fn().mockResolvedValue(registrations)
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistrations },
    configurable: true,
  })
  return getRegistrations
}

function stubCaches(names: string[]) {
  const deleted: string[] = []
  vi.stubGlobal('caches', {
    keys: vi.fn().mockResolvedValue(names),
    delete: vi.fn(async (name: string) => {
      deleted.push(name)
      return true
    }),
  })
  return deleted
}

function clearStubs() {
  // Reflect rather than `delete`: navigator.serviceWorker is non-optional in
  // the DOM lib, so a delete expression on it is a type error even though the
  // property is configurable at runtime.
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.unstubAllGlobals()
}

describe('isRetiredWorkerScript', () => {
  it('retires the legacy vanilla UI worker and the retired /next/ worker', () => {
    expect(isRetiredWorkerScript('https://cals.example.com/public/sw.js')).toBe(true)
    expect(isRetiredWorkerScript('https://cals.example.com/next/sw.js')).toBe(true)
    expect(isRetiredWorkerScript('http://192.168.1.10:8151/next/sw.js')).toBe(true)
  })

  it('leaves this app own root worker alone', () => {
    // The whole point of the guard: retiring the live worker would silently
    // break the install on the device that just installed it.
    expect(isRetiredWorkerScript('https://cals.example.com/sw.js')).toBe(false)
    expect(isRetiredWorkerScript('http://192.168.1.10:8151/sw.js')).toBe(false)
  })

  it('ignores an empty script URL', () => {
    // A registration with no active/installing/waiting worker yet.
    expect(isRetiredWorkerScript('')).toBe(false)
  })
})

describe('isRetiredCacheName', () => {
  it('matches only the legacy cals-v caches', () => {
    expect(isRetiredCacheName('cals-v2.0.0')).toBe(true)
    expect(isRetiredCacheName('cals-v1.7.0')).toBe(true)
    expect(isRetiredCacheName('workbox-precache-v2-https://cals.example.com/')).toBe(false)
    expect(isRetiredCacheName('something-else')).toBe(false)
  })
})

describe('retireReplacedServiceWorkers', () => {
  beforeEach(() => {
    clearStubs()
  })

  afterEach(() => {
    clearStubs()
    vi.restoreAllMocks()
  })

  it('unregisters only the replaced workers and deletes only the legacy caches', async () => {
    const legacy = registration('https://cals.example.com/public/sw.js')
    const next = registration('https://cals.example.com/next/sw.js')
    const current = registration('https://cals.example.com/sw.js')
    stubServiceWorker([legacy.registration, next.registration, current.registration])
    const deleted = stubCaches(['cals-v2.0.0', 'workbox-precache-v2-x'])

    const report = await retireReplacedServiceWorkers()

    expect(legacy.unregister).toHaveBeenCalledOnce()
    expect(next.unregister).toHaveBeenCalledOnce()
    // The live root worker must survive.
    expect(current.unregister).not.toHaveBeenCalled()
    expect(deleted).toEqual(['cals-v2.0.0'])
    expect(report.unregistered).toEqual([
      'https://cals.example.com/public/sw.js',
      'https://cals.example.com/next/sw.js',
    ])
    expect(report.cachesDeleted).toEqual(['cals-v2.0.0'])
  })

  it('is a no-op on a device that has nothing to retire', async () => {
    const current = registration('https://cals.example.com/sw.js')
    stubServiceWorker([current.registration])
    const deleted = stubCaches([])

    const report = await retireReplacedServiceWorkers()

    expect(current.unregister).not.toHaveBeenCalled()
    expect(deleted).toEqual([])
    expect(report).toEqual({ unregistered: [], cachesDeleted: [] })
  })

  it('falls back to the pending worker when none is active yet', async () => {
    const unregister = vi.fn().mockResolvedValue(true)
    stubServiceWorker([{ installing: { scriptURL: 'https://cals.example.com/next/sw.js' }, unregister }])
    stubCaches([])

    const report = await retireReplacedServiceWorkers()

    expect(unregister).toHaveBeenCalledOnce()
    expect(report.unregistered).toEqual(['https://cals.example.com/next/sw.js'])
  })

  it('never throws into the app when the APIs are unavailable', async () => {
    // No serviceWorker, no caches: a browser with them disabled, or a
    // non-secure context. Boot must still succeed.
    await expect(retireReplacedServiceWorkers()).resolves.toEqual({
      unregistered: [],
      cachesDeleted: [],
    })
  })

  it('never throws into the app when the APIs reject', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    vi.stubGlobal('caches', {
      keys: vi.fn().mockRejectedValue(new Error('denied')),
      delete: vi.fn(),
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(retireReplacedServiceWorkers()).resolves.toEqual({
      unregistered: [],
      cachesDeleted: [],
    })
    expect(warn).toHaveBeenCalled()
  })
})
