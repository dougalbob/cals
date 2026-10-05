export const THEME_STORAGE_KEY = 'cals.theme'
export const HAPTICS_STORAGE_KEY = 'cals.haptics-enabled'

export const THEME_OPTIONS = [
  { id: 'default', label: 'Default' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'berry', label: 'Berry' },
  { id: 'dark', label: 'Dark' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'matrix', label: 'Matrix' },
] as const

export type ThemeName = (typeof THEME_OPTIONS)[number]['id']

let hapticsSessionValue: boolean | undefined

const THEME_COLORS: Record<ThemeName, string> = {
  default: '#4a90d9',
  ocean: '#0984e3',
  forest: '#00b894',
  sunset: '#e17055',
  berry: '#a55eea',
  dark: '#74b9ff',
  midnight: '#a29bfe',
  matrix: '#008f11',
}

function isThemeName(value: string | null): value is ThemeName {
  return THEME_OPTIONS.some((theme) => theme.id === value)
}

/** Read the device-local theme; unknown values safely fall back to Default. */
export function getThemePreference(): ThemeName {
  if (typeof window === 'undefined') return 'default'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeName(stored) ? stored : 'default'
  } catch {
    return 'default'
  }
}

/** Apply the palette at the document root so Tailwind's theme tokens follow it. */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

/** Store the device-local theme separately from per-account settings. */
export function saveThemePreference(theme: ThemeName): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable in private browsing; the in-memory theme still applies.
  }
}

/** Existing haptics stay enabled by default; the user can turn them off locally. */
export function getHapticsPreference(): boolean {
  if (hapticsSessionValue !== undefined) return hapticsSessionValue
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(HAPTICS_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function saveHapticsPreference(enabled: boolean): void {
  hapticsSessionValue = enabled
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HAPTICS_STORAGE_KEY, String(enabled))
  } catch {
    // Storage can be unavailable; the current session still uses the UI state.
  }
}

/** One optional haptic gate shared by every interaction in the React app. */
export function vibrate(ms: number): void {
  if (!getHapticsPreference() || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(ms)
  } catch {
    // Haptics are optional; unsupported or blocked vibration must not break the action.
  }
}
