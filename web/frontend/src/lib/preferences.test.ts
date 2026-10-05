// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyTheme,
  getHapticsPreference,
  getThemePreference,
  HAPTICS_STORAGE_KEY,
  saveHapticsPreference,
  saveThemePreference,
  THEME_STORAGE_KEY,
  vibrate,
} from './preferences'

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.dataset.theme = 'default'
  vi.unstubAllGlobals()
})

describe('device-local presentation preferences', () => {
  it('stores and applies a known theme, falling back safely for unknown values', () => {
    saveThemePreference('ocean')
    expect(getThemePreference()).toBe('ocean')
    applyTheme('ocean')
    expect(document.documentElement.dataset.theme).toBe('ocean')

    window.localStorage.setItem(THEME_STORAGE_KEY, 'not-a-theme')
    expect(getThemePreference()).toBe('default')
  })

  it('keeps haptics enabled by default and gates the shared vibration helper', () => {
    const vibration = vi.fn()
    vi.stubGlobal('navigator', { vibrate: vibration })

    expect(getHapticsPreference()).toBe(true)
    saveHapticsPreference(false)
    expect(window.localStorage.getItem(HAPTICS_STORAGE_KEY)).toBe('false')
    vibrate(10)
    expect(vibration).not.toHaveBeenCalled()

    saveHapticsPreference(true)
    vibrate(40)
    expect(vibration).toHaveBeenCalledWith(40)
  })
})
