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
  it('lays out nav links in equal fifths and haptically signals swipe paging when supported', async () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    renderApp(false)

    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    const scroller = within(nav).getByTestId('primary-navigation-scroll') as HTMLDivElement
    // 7 destinations (slice 14.5 added Nutrition) plus a trailing spacer slot
    // so the overlay Back button doesn't cover Foods/Recipes on page 1.
    const links = within(scroller).getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(7)
    expect(links.every((link) => link.className.includes('w-1/5'))).toBe(true)
    expect(nav.className).toContain('z-40')
    expect(nav.textContent).toContain('Swipe horizontally or use the arrow to reveal Foods and Recipes')

    // Overlay controls sit outside the scroller — More on the right when on
    // page 0 (owner niggle, 2026-10-05: the Back arrow must always be at the
    // far left when visible, never in the middle of the bar).
    expect(within(nav).getByTestId('primary-navigation-more')).toBeTruthy()

    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 500 })
    // 7 destinations + 1 spacer @ w-1/5 each = 8 * 100px = 800px
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 800 })
    scroller.scrollLeft = 300 // past the half-way point → page 1 (Back visible)
    fireEvent.scroll(scroller)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(10)

    fireEvent.scroll(scroller)
    expect(vibrate).toHaveBeenCalledTimes(1)

    scroller.scrollLeft = 0
    fireEvent.scroll(scroller)
    expect(vibrate).toHaveBeenCalledTimes(2)
  })

  it('uses an overlay › More on the far right to reveal Foods/Recipes and a ‹ Back on the far left to return', async () => {
    renderApp(false)

    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    const scroller = within(nav).getByTestId('primary-navigation-scroll') as HTMLDivElement
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 800 })

    const links = within(scroller).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(expect.arrayContaining(['🥗Nutrition', '🍲Foods', '🍽️Recipes']))

    // Page 0: More sits at the far right, no Back button.
    const moreButton = within(nav).getByTestId('primary-navigation-more')
    expect(within(nav).queryByTestId('primary-navigation-back')).toBeNull()
    fireEvent.click(moreButton)
    // Scroll to page 1 aligns the 4th item under slot 0 (leaving a full slot
    // under the Back overlay, so Foods lands under slot 1).
    expect(scroller.scrollLeft).toBe(400)
    // After scrolling, Back is on the far left.
    const backButton = within(nav).getByTestId('primary-navigation-back')
    expect(backButton).toBeTruthy()
    expect(within(nav).queryByTestId('primary-navigation-more')).toBeNull()

    fireEvent.click(backButton)
    expect(scroller.scrollLeft).toBe(0)
    expect(within(nav).getByTestId('primary-navigation-more')).toBeTruthy()
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
