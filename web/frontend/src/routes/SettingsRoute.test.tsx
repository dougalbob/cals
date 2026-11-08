// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { User } from '../api/types'
import { HAPTICS_STORAGE_KEY, THEME_STORAGE_KEY } from '../lib/preferences'
import { SettingsRoute } from './SettingsRoute'

const initialUser: User = {
  id: 1,
  email: 'owner@example.com',
  name: 'Dougal',
  daily_calorie_goal: 2000,
  daily_water_goal_ml: 2000,
  weight_unit: 'stones',
  bank_start_date: '2026-09-01',
  bank_window_days: 14,
  bank_ring_surplus_limit_kcal: 2000,
  bank_ring_deficit_limit_kcal: 2000,
  weight_trend_days: 7,
  body_outline: null,
  target_weight_kg: 85,
  is_admin: true,
  created_at: '2025-02-14T09:00:00Z',
  updated_at: '2026-10-05T07:00:00Z',
}

let account = { ...initialUser }
let writes: Record<string, unknown>[] = []

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  document.documentElement.dataset.theme = 'default'
  account = { ...initialUser }
  writes = []
})

function renderSettings() {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const pathname = new URL(String(input), 'http://localhost').pathname
    if (pathname === '/api/users/me' && init?.method === 'PUT') {
      const update = JSON.parse(String(init.body)) as Record<string, unknown>
      writes.push(update)
      account = { ...account, ...update } as User
      return new Response(JSON.stringify(account), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const body = pathname === '/api/users/me' ? account : { version: '2.0.0' }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsRoute', () => {
  it('saves account settings per user and keeps theme and haptics on this device', async () => {
    renderSettings()
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByLabelText(/Bank window/)).toHaveProperty('value', '14')
    expect(screen.getByText(/An internet connection is required/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Daily calorie target/), { target: { value: '2100' } })
    fireEvent.change(screen.getByLabelText(/Daily water target/), { target: { value: '1800' } })
    fireEvent.change(screen.getByLabelText(/Weight unit/), { target: { value: 'kg' } })
    fireEvent.change(screen.getByLabelText(/Bank window/), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText(/Custom bank window/), { target: { value: '21' } })
    fireEvent.change(screen.getByLabelText(/Surplus ring limit/), { target: { value: '3500' } })
    fireEvent.change(screen.getByLabelText(/Deficit ring limit/), { target: { value: '1250' } })
    fireEvent.change(screen.getByLabelText(/Weigh-in trend window/), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Body-map outline/), { target: { value: 'female' } })
    fireEvent.change(screen.getByLabelText('Colour theme'), { target: { value: 'matrix' } })
    fireEvent.click(screen.getByLabelText(/Haptic feedback when supported/))
    fireEvent.click(screen.getByRole('button', { name: 'Save account settings' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      daily_calorie_goal: 2100,
      daily_water_goal_ml: 1800,
      weight_unit: 'kg',
      bank_window_days: 21,
      bank_ring_surplus_limit_kcal: 3500,
      bank_ring_deficit_limit_kcal: 1250,
      weight_trend_days: 10,
      body_outline: 'female',
    })
    expect(await screen.findByText('Settings saved to your account.')).toBeTruthy()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('matrix')
    expect(window.localStorage.getItem(HAPTICS_STORAGE_KEY)).toBe('false')
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('matrix'))
  })

  it('keeps invalid input visible and does not send a bad ring limit', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: 'Settings' })
    const surplusLimit = screen.getByLabelText(/Surplus ring limit/) as HTMLInputElement
    fireEvent.change(surplusLimit, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save account settings' }))

    expect((await screen.findByRole('alert')).textContent).toContain('The surplus ring limit must be a whole number above zero.')
    expect(surplusLimit.value).toBe('')
    expect(writes).toHaveLength(0)
  })
})
