import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut, queryKeys } from '../api/client'
import type { BodyOutline, SessionResponse, User, VersionResponse } from '../api/types'
import { getInstallPrompt, startInstallPromptCapture, subscribeToInstallPrompt, type InstallPromptEvent } from '../lib/pwaInstall'
import {
  applyTheme,
  getHapticsPreference,
  getThemePreference,
  saveHapticsPreference,
  saveThemePreference,
  THEME_OPTIONS,
  type ThemeName,
} from '../lib/preferences'

interface SettingsDraft {
  userId: number
  name: string
  daily_calorie_goal: string
  daily_water_goal_ml: string
  weight_unit: string
  bank_start_date: string
  bank_window_days: string
  bank_window_is_custom: boolean
  bank_ring_surplus_limit_kcal: string
  bank_ring_deficit_limit_kcal: string
  weight_trend_days: string
  body_outline: string
}

const PRESET_BANK_WINDOWS = [0, 7, 14, 30]
const controlClass = 'mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 py-2 text-ink'

function draftFromUser(user: User): SettingsDraft {
  return {
    userId: user.id,
    name: user.name ?? '',
    daily_calorie_goal: String(user.daily_calorie_goal),
    daily_water_goal_ml: String(user.daily_water_goal_ml),
    weight_unit: user.weight_unit,
    bank_start_date: user.bank_start_date,
    bank_window_days: String(user.bank_window_days),
    bank_window_is_custom: !PRESET_BANK_WINDOWS.includes(user.bank_window_days),
    bank_ring_surplus_limit_kcal: String(user.bank_ring_surplus_limit_kcal),
    bank_ring_deficit_limit_kcal: String(user.bank_ring_deficit_limit_kcal),
    weight_trend_days: String(user.weight_trend_days),
    body_outline: user.body_outline ?? '',
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 shadow-card">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-ink-light">{hint}</span>}
    </label>
  )
}

function integerValue(raw: string, minimum: number): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum) return null
  return value
}

export function SettingsRoute() {
  const queryClient = useQueryClient()
  const user = useQuery<User>({
    queryKey: queryKeys.user,
    queryFn: () => apiGet<User>('/api/users/me'),
  })
  const version = useQuery<VersionResponse>({
    queryKey: queryKeys.version,
    queryFn: () => apiGet<VersionResponse>('/api/version'),
    staleTime: 5 * 60_000,
  })

  const [draftOverride, setDraftOverride] = useState<SettingsDraft | null>(null)
  const draft = draftOverride?.userId === user.data?.id
    ? draftOverride
    : user.data
      ? draftFromUser(user.data)
      : null
  const [validationError, setValidationError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(getThemePreference)
  const [hapticsEnabled, setHapticsEnabled] = useState(getHapticsPreference)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(getInstallPrompt)
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false
    const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
    const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    return displayMode || iosStandalone
  })

  useEffect(() => {
    applyTheme(theme)
    saveThemePreference(theme)
  }, [theme])

  useEffect(() => {
    startInstallPromptCapture()
    const onInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
    const unsubscribe = subscribeToInstallPrompt(setInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      unsubscribe()
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const saveSettings = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPut<User>('/api/users/me', payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.user, updated)
      queryClient.setQueryData<SessionResponse>(queryKeys.session, (current) =>
        current ? { ...current, acting_user: updated } : current,
      )
      setDraftOverride(draftFromUser(updated))
      setValidationError(null)
      setSavedNotice(true)
    },
  })

  if (user.isError) {
    return (
      <div role="alert" className="rounded-xl bg-card p-4 text-danger shadow-card">
        Could not load settings: {(user.error as Error).message}
      </div>
    )
  }

  if (user.isPending || !draft) {
    return <p className="px-1 py-8 text-center text-sm text-ink-light">Loading settings…</p>
  }

  const updateDraft = (update: (current: SettingsDraft) => SettingsDraft) => {
    const account = user.data
    if (!account) return
    setDraftOverride((current) => update(current?.userId === account.id ? current : draftFromUser(account)))
  }

  const setValue = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    updateDraft((current) => ({ ...current, [key]: value }))
    saveSettings.reset()
    setValidationError(null)
    setSavedNotice(false)
  }

  const handleBankWindowChoice = (choice: string) => {
    updateDraft((current) => {
      if (choice === 'custom') {
        const days = integerValue(current.bank_window_days, 0)
        return {
          ...current,
          bank_window_is_custom: true,
          bank_window_days: days === 0 ? '14' : current.bank_window_days,
        }
      }
      return { ...current, bank_window_is_custom: false, bank_window_days: choice }
    })
    setValidationError(null)
    setSavedNotice(false)
    saveSettings.reset()
  }

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError(null)
    setSavedNotice(false)

    const calorieGoal = integerValue(draft.daily_calorie_goal, 0)
    const waterGoal = integerValue(draft.daily_water_goal_ml, 0)
    const bankWindow = integerValue(draft.bank_window_days, 0)
    const surplusLimit = integerValue(draft.bank_ring_surplus_limit_kcal, 1)
    const deficitLimit = integerValue(draft.bank_ring_deficit_limit_kcal, 1)
    const trendWindow = integerValue(draft.weight_trend_days, 3)

    if (calorieGoal === null) return setValidationError('Enter a whole-number calorie target of zero or more.')
    if (waterGoal === null) return setValidationError('Enter a whole-number water target of zero or more.')
    if (bankWindow === null || (draft.bank_window_is_custom && bankWindow < 1)) {
      return setValidationError('Enter a whole-number custom bank window of at least 1 day, or choose All time.')
    }
    if (surplusLimit === null) return setValidationError('The surplus ring limit must be a whole number above zero.')
    if (deficitLimit === null) return setValidationError('The deficit ring limit must be a whole number above zero.')
    if (trendWindow === null || trendWindow > 90) return setValidationError('The trend window must be between 3 and 90 weigh-ins.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.bank_start_date)) {
      return setValidationError('Choose a valid bank start date.')
    }
    if (draft.weight_unit !== 'stones' && draft.weight_unit !== 'kg') {
      return setValidationError('Choose stones or kilograms for your weight unit.')
    }

    const bodyOutline: BodyOutline | undefined =
      draft.body_outline === 'female' || draft.body_outline === 'male' ? draft.body_outline : undefined
    saveSettings.mutate({
      name: draft.name.trim(),
      daily_calorie_goal: calorieGoal,
      daily_water_goal_ml: waterGoal,
      weight_unit: draft.weight_unit,
      bank_start_date: draft.bank_start_date,
      bank_window_days: bankWindow,
      bank_ring_surplus_limit_kcal: surplusLimit,
      bank_ring_deficit_limit_kcal: deficitLimit,
      weight_trend_days: trendWindow,
      ...(bodyOutline ? { body_outline: bodyOutline } : {}),
    })
  }

  const bankWindowChoice = draft.bank_window_is_custom ? 'custom' : draft.bank_window_days

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setIsInstalled(true)
    setInstallPrompt(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="px-1">
        <h1 className="m-0 text-2xl font-semibold">Settings</h1>
        <p className="mt-1 mb-0 text-sm text-ink-light">
          Your targets and bank preferences follow your account. Theme and haptics are saved on this device.
        </p>
      </header>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <Section title="Profile and daily targets">
          <Field label="Name">
            <input className={controlClass} type="text" autoComplete="name" value={draft.name} onChange={(event) => setValue('name', event.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Daily calorie target" hint="kcal per day">
              <input className={controlClass} type="number" min="0" step="1" inputMode="numeric" value={draft.daily_calorie_goal} onChange={(event) => setValue('daily_calorie_goal', event.target.value)} />
            </Field>
            <Field label="Daily water target" hint="millilitres per day">
              <input className={controlClass} type="number" min="0" step="1" inputMode="numeric" value={draft.daily_water_goal_ml} onChange={(event) => setValue('daily_water_goal_ml', event.target.value)} />
            </Field>
          </div>
          <Field label="Weight unit">
            <select className={controlClass} value={draft.weight_unit} onChange={(event) => setValue('weight_unit', event.target.value)}>
              <option value="stones">Stones and pounds</option>
              <option value="kg">Kilograms</option>
            </select>
          </Field>
          <Field label="Bank start date" hint="The bank never includes days before this date.">
            <input className={controlClass} type="date" value={draft.bank_start_date} onChange={(event) => setValue('bank_start_date', event.target.value)} />
          </Field>
        </Section>

        <Section title="Calorie bank and rings">
          <Field label="Bank window" hint="This changes the bank figure everywhere it appears, not just on this screen.">
            <select className={controlClass} value={bankWindowChoice} onChange={(event) => handleBankWindowChoice(event.target.value)}>
              <option value="30">Last 30 days</option>
              <option value="14">Last 14 days</option>
              <option value="7">Last 7 days</option>
              <option value="0">All time</option>
              <option value="custom">Custom number of days</option>
            </select>
          </Field>
          {bankWindowChoice === 'custom' && (
            <Field label="Custom bank window" hint="Enter the number of completed days to include.">
              <input className={controlClass} type="number" min="1" step="1" inputMode="numeric" value={draft.bank_window_days} onChange={(event) => setValue('bank_window_days', event.target.value)} />
            </Field>
          )}
          <div className="rounded-xl border border-line-light bg-surface p-3 text-sm text-ink-light">
            The ring limits below change only where the coloured arcs fill up. They never change the bank calculation or hide the exact balance.
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Surplus ring limit" hint="kcal before the green arc fills">
              <input className={controlClass} type="number" min="1" step="1" inputMode="numeric" value={draft.bank_ring_surplus_limit_kcal} onChange={(event) => setValue('bank_ring_surplus_limit_kcal', event.target.value)} />
            </Field>
            <Field label="Deficit ring limit" hint="kcal before the red arc fills">
              <input className={controlClass} type="number" min="1" step="1" inputMode="numeric" value={draft.bank_ring_deficit_limit_kcal} onChange={(event) => setValue('bank_ring_deficit_limit_kcal', event.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Metrics preferences">
          <Field label="Weigh-in trend window" hint="Number of weigh-ins used for the moving average, from 3 to 90. This is not a number of days.">
            <input className={controlClass} type="number" min="3" max="90" step="1" inputMode="numeric" value={draft.weight_trend_days} onChange={(event) => setValue('weight_trend_days', event.target.value)} />
          </Field>
          <Field label="Body-map outline" hint="Choose which outline the body map uses for its chest or bust measurement point.">
            <select className={controlClass} value={draft.body_outline} onChange={(event) => setValue('body_outline', event.target.value)}>
              <option value="">Not chosen yet</option>
              <option value="female">Female outline</option>
              <option value="male">Male outline</option>
            </select>
          </Field>
        </Section>

        <div className="rounded-2xl bg-card p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="m-0 text-base font-semibold">Theme</h2>
              <p className="mt-1 mb-0 text-sm text-ink-light">This appearance choice is stored on this device, not on your account.</p>
            </div>
            <label className="block text-sm font-medium sm:min-w-48">
              Colour theme
              <select className={controlClass} value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)}>
                {THEME_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={hapticsEnabled}
              onChange={(event) => {
                const enabled = event.target.checked
                setHapticsEnabled(enabled)
                saveHapticsPreference(enabled)
              }}
            />
            Haptic feedback when supported
          </label>
        </div>

        {(validationError || saveSettings.error) && (
          <p role="alert" className="m-0 rounded-xl bg-red-50 p-3 text-sm text-danger">
            {validationError ?? (saveSettings.error as Error).message}
          </p>
        )}
        {savedNotice && <p role="status" className="m-0 text-sm font-medium text-success">Settings saved to your account.</p>}
        <button
          type="submit"
          disabled={saveSettings.isPending}
          className="min-h-12 rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
        >
          {saveSettings.isPending ? 'Saving…' : 'Save account settings'}
        </button>
      </form>

      <Section title="More">
        <Link className="flex min-h-11 items-center justify-between rounded-xl border border-line px-3 text-sm font-medium text-primary no-underline hover:bg-surface" to="/drinks">
          <span>My drinks</span><span aria-hidden>›</span>
        </Link>
        <Link className="flex min-h-11 items-center justify-between rounded-xl border border-line px-3 text-sm font-medium text-primary no-underline hover:bg-surface" to="/nutrition">
          <span>Nutrition targets</span><span aria-hidden>›</span>
        </Link>
      </Section>

      <Section title="Install cals">
        {isInstalled ? (
          <p role="status" className="m-0 text-sm text-success">cals is installed on this device.</p>
        ) : installPrompt ? (
          <button type="button" className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-dark" onClick={() => void installApp()}>
            Install app
          </button>
        ) : (
          <p className="m-0 text-sm text-ink-light">When your browser offers it, choose Install from its menu. On iPhone or iPad, use Share, then Add to Home Screen.</p>
        )}
        <p className="m-0 text-xs text-ink-light">
          An internet connection is required. Installing adds an app shortcut only; there is no offline logging, queued saving or cached-data promise.
        </p>
      </Section>

      <footer className="pb-2 text-center text-xs text-ink-light">
        cals {version.data?.version ? `· v${version.data.version}` : ''}
      </footer>
    </div>
  )
}
