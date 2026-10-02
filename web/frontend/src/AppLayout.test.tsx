// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AppLayout } from './AppLayout'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderApp(devIdentitySwitch: boolean) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname
    const body = path === '/api/users/me'
      ? {
          id: 1,
          email: 'dev@example.com',
          name: 'Dev user',
          daily_calorie_goal: 2000,
        }
      : {
          version: '2.0.0',
          ...(devIdentitySwitch ? { dev_identity_switch: true } : {}),
        }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>Diary content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppLayout development identity link', () => {
  it('shows the switch-user link only when the server enables the DEV identity switch', async () => {
    const { unmount } = renderApp(true)
    const link = await screen.findByRole('link', { name: 'Switch user' })
    expect(link.getAttribute('href')).toBe('/dev/identity')

    unmount()
    cleanup()
    renderApp(false)
    expect(await screen.findByText('Diary content')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Switch user' })).toBeNull()
  })
})
