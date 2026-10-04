// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AppLayout } from './AppLayout'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderApp(devIdentitySwitch: boolean, initialPath = '/') {
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
