// @vitest-environment jsdom
/** Requests the layout made through the fixture stub, newest last. */
let requests: { method: string; path: string; body: string | null }[] = []
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AppLayout } from './AppLayout'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderApp(devIdentitySwitch: boolean, initialPath = '/') {
  return renderAppWithSession({ isAdmin: false, viewingAsOther: false }, devIdentitySwitch, initialPath)
}

/** One identity standing in for both, unless the test asks for a swap. */
function renderAppWithSession(
  options: { isAdmin?: boolean; viewingAsOther?: boolean; actingName?: string },
  devIdentitySwitch = false,
  initialPath = '/',
) {
  const owner = {
    id: 1,
    email: 'owner@example.com',
    name: 'Owner',
    daily_calorie_goal: 2000,
    is_admin: options.isAdmin ?? false,
  }
  const other = {
    id: 2,
    email: 'sarah@example.com',
    name: options.actingName ?? 'Sarah',
    daily_calorie_goal: 1600,
    is_admin: false,
  }
  const acting = options.viewingAsOther ? other : owner

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    requests.push({
      method: init?.method ?? 'GET',
      path,
      body: typeof init?.body === 'string' ? init.body : null,
    })
    const body = path === '/api/session' || path === '/api/users/me'
      ? path === '/api/users/me'
        ? acting
        : {
            authenticated_user: owner,
            acting_user: acting,
            is_admin: options.isAdmin ?? false,
            viewing_as_other: options.viewingAsOther ?? false,
          }
      : path === '/api/users'
        ? [owner, other]
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
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>Diary content</div>} />
            <Route path="recipes" element={<div>Recipe content</div>} />
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
    expect(screen.getByRole('link', { name: 'Recipes' })).toBeTruthy()

    unmount()
    cleanup()
    renderApp(false)
    expect(await screen.findByText('Diary content')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Switch user' })).toBeNull()
  })
})

describe('AppLayout primary navigation', () => {
  it('shows five equal-width navigation slots at a time and haptically signals swipe paging when supported', async () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    renderApp(false)

    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    const scroller = within(nav).getByTestId('primary-navigation-scroll') as HTMLDivElement
    const links = within(nav).getAllByRole('link')

    expect(links).toHaveLength(6)
    expect(links.every((link) => link.className.includes('w-1/5'))).toBe(true)
    expect(nav.className).toContain('z-40')
    expect(nav.textContent).toContain('Swipe horizontally or use the arrow to reveal Foods and Recipes')
    const overflowButton = within(nav).getByTestId('primary-navigation-overflow-button')
    expect(overflowButton.className).toContain('w-1/5')
    expect(scroller.children[4]).toBe(overflowButton)

    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 700 })
    scroller.scrollLeft = 100
    fireEvent.scroll(scroller)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(10)

    // A single swipe/page change produces one pulse, not one per scroll event.
    fireEvent.scroll(scroller)
    expect(vibrate).toHaveBeenCalledTimes(1)

    scroller.scrollLeft = 0
    fireEvent.scroll(scroller)
    expect(vibrate).toHaveBeenCalledTimes(2)
  })

  it('uses the fifth slot as an arrow to reveal Foods and Recipes, with a way back', async () => {
    renderApp(false)

    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    const scroller = within(nav).getByTestId('primary-navigation-scroll') as HTMLDivElement
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 700 })

    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(expect.arrayContaining(['🥗Foods', '🍽️Recipes']))
    expect(scroller.children).toHaveLength(7)

    const overflowButton = within(nav).getByRole('button', { name: 'Show Foods and Recipes' })
    expect(scroller.children[4]).toBe(overflowButton)
    fireEvent.click(overflowButton)
    expect(scroller.scrollLeft).toBe(200)
    expect(within(nav).getByRole('button', { name: 'Show earlier navigation destinations' })).toBeTruthy()

    fireEvent.click(overflowButton)
    expect(scroller.scrollLeft).toBe(0)
    expect(within(nav).getByRole('button', { name: 'Show Foods and Recipes' })).toBeTruthy()

    // From a partial swipe position, the arrow should continue to the end
    // rather than treating the first newly revealed item as the back state.
    scroller.scrollLeft = 100
    fireEvent.scroll(scroller)
    const moreButton = within(nav).getByRole('button', { name: 'Show Foods and Recipes' })
    fireEvent.click(moreButton)
    expect(scroller.scrollLeft).toBe(200)
    expect(within(nav).getByRole('button', { name: 'Show earlier navigation destinations' })).toBeTruthy()
  })
})

describe('AppLayout acting-user switch (decisions 45 and 88)', () => {
  it('hides the swap control from a Standard user', async () => {
    requests = []
    renderAppWithSession({ isAdmin: false })
    expect(await screen.findByText('Diary content')).toBeTruthy()
    expect(screen.queryByTestId('swap-user-button')).toBeNull()
    expect(screen.queryByTestId('viewing-as-banner')).toBeNull()
  })

  it('lets an Admin swap to another account, sending the chosen id to the server', async () => {
    requests = []
    renderAppWithSession({ isAdmin: true })

    fireEvent.click(await screen.findByTestId('swap-user-button'))

    const sheet = await screen.findByRole('dialog', { name: 'Swap user' })
    expect(within(sheet).getByText(/Anything you log while swapped belongs to them/)).toBeTruthy()

    // Both household accounts are offered, and the Admin's own is labelled.
    expect(await within(sheet).findByText('Your own account')).toBeTruthy()
    expect(within(sheet).getByText('sarah@example.com')).toBeTruthy()

    fireEvent.click(within(sheet).getByRole('button', { name: /Sarah/ }))

    await waitFor(() => {
      const swap = requests.find((entry) => entry.path === '/api/session/acting-user')
      expect(swap?.method).toBe('POST')
      expect(JSON.parse(swap?.body ?? '{}')).toEqual({ user_id: 2 })
    })
  })

  it('names the account being viewed and always offers a way back', async () => {
    requests = []
    renderAppWithSession({ isAdmin: true, viewingAsOther: true, actingName: 'Sarah' })

    const banner = await screen.findByTestId('viewing-as-banner')
    expect(banner.textContent).toContain('Viewing as Sarah')

    // The Admin keeps the swap control while swapped, or the way back would be
    // unreachable.
    expect(screen.getByTestId('swap-user-button')).toBeTruthy()

    fireEvent.click(screen.getByTestId('return-to-own-account'))

    await waitFor(() => {
      const back = requests.find((entry) => entry.path === '/api/session/acting-user')
      expect(back?.method).toBe('DELETE')
    })
  })
})
