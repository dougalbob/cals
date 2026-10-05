import { Suspense, useCallback, useEffect, useRef, useState, type UIEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, queryKeys } from './api/client'
import type { SessionResponse, VersionResponse } from './api/types'
import { SwapUserSheet } from './components/SwapUserSheet'

const NAV = [
  { to: '/', label: 'Today', icon: '🏠', end: true },
  { to: '/diary', label: 'Diary', icon: '📔', end: false },
  { to: '/calendar', label: 'Calendar', icon: '📅', end: false },
  { to: '/metrics', label: 'Metrics', icon: '📈', end: false },
  { to: '/nutrition', label: 'Nutrition', icon: '🥗', end: false },
  { to: '/foods', label: 'Foods', icon: '🍲', end: false },
  { to: '/recipes', label: 'Recipes', icon: '🍽️', end: false },
]

/**
 * Number of slots visible at a time in the bottom nav. With 7 destinations the
 * first page shows Today/Diary/Calendar/Metrics/Nutrition; the › button on the
 * right reveals Foods/Recipes, and a ‹ Back button at the far left returns.
 * The back button sits on the far left of the bar as an overlay (owner
 * niggle, session 2026-10-05) so it never lands in the middle of the row.
 */
const VISIBLE_NAV_ITEMS = 5


function vibrateForNavigationChange() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(10)
  } catch {
    // Haptics are optional; navigation must work even when the browser blocks vibration.
  }
}

function NavigationLink({ item }: { item: (typeof NAV)[number] }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        [
          'flex-none w-1/5 snap-start flex flex-col items-center gap-0.5 py-2 min-h-11 text-xs font-medium no-underline',
          isActive ? 'text-primary' : 'text-ink-light hover:text-ink',
        ].join(' ')
      }
    >
      <span aria-hidden className="text-lg leading-none">
        {item.icon}
      </span>
      {item.label}
    </NavLink>
  )
}

export function AppLayout() {
  const { pathname } = useLocation()
  const navRef = useRef<HTMLDivElement>(null)
  const navPageRef = useRef(0)
  // Page 0 (default, five slots visible) shows the › More overlay on the far
  // right; page 1 (scrolled to reveal Foods/Recipes) shows ‹ Back on the far
  // left (owner niggle, 2026-10-05 — Back must never land in the middle of
  // the bar).
  const [navOnPage1, setNavOnPage1] = useState(false)

  const queryClient = useQueryClient()
  const [swapOpen, setSwapOpen] = useState(false)

  // One request carries both identities: whose data is on screen, and who is
  // really signed in. The Admin flag belongs to the second one.
  const { data: session } = useQuery<SessionResponse>({
    queryKey: queryKeys.session,
    queryFn: () => apiGet<SessionResponse>('/api/session'),
  })
  const user = session?.acting_user
  const viewingAsOther = Boolean(session?.viewing_as_other)

  // Every cached query is account-scoped: drop the lot rather than invalidate
  // a handful of keys, or the previous account's data would linger on screen.
  const returnToOwnAccount = useMutation<SessionResponse, Error, void>({
    mutationFn: () => apiDelete<SessionResponse>('/api/session/acting-user'),
    onSuccess: () => queryClient.clear(),
  })

  const { data: version } = useQuery<VersionResponse>({
    queryKey: queryKeys.version,
    queryFn: () => apiGet<VersionResponse>('/api/version'),
    staleTime: 5 * 60_000,
  })

  /** Which page the scroll view is on. Synchronises the overlays with the
   *  scroll position; routing a destination ≥ VISIBLE_NAV_ITEMS also flips
   *  this so the right overlay is rendered on first paint for deep links. */
  const setPage = useCallback((page: number) => {
    setNavOnPage1(page >= 1)
    navPageRef.current = page
  }, [])

  // If a route change lands on an overflow item (Foods/Recipes), scroll the
  // nav so the Back overlay appears and the item is in view. Page 0 (default)
  // shows the first five; page 1 reveals Foods/Recipes with a ‹ Back on the
  // far left.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const destinationIndex = NAV.findIndex(({ to, end }) =>
      end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`),
    )
    if (destinationIndex < 0) return

    // Destinations at index ≥ VISIBLE_NAV_ITEMS live on page 1 (Foods/Recipes).
    // Nutrition is at index 4 (last visible slot), so it stays on page 0.
    const wantPage = destinationIndex >= VISIBLE_NAV_ITEMS ? 1 : 0

    // Scroll position is set on the next frame so the nav has its real width
    // in jsdom as well as in the browser; synchronously reading clientWidth
    // on first render returned 0 in tests.
    requestAnimationFrame(() => {
      if (!nav || nav.clientWidth === 0) return
      const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
      const nextScroll = wantPage === 1 ? (VISIBLE_NAV_ITEMS - 1) * itemWidth : 0
      if (Math.abs(nav.scrollLeft - nextScroll) > 1) {
        nav.scrollLeft = nextScroll
      }
      setPage(wantPage)
    })
  }, [pathname, setPage])

  const handleNavScroll = (event: UIEvent<HTMLDivElement>) => {
    const nav = event.currentTarget
    if (nav.clientWidth === 0) return
    const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
    const nextPage = nav.scrollLeft > itemWidth / 2 ? 1 : 0
    if (nextPage === navPageRef.current) return
    setPage(nextPage)
    vibrateForNavigationChange()
  }

  const handleMoreClick = () => {
    const nav = navRef.current
    if (!nav || nav.clientWidth === 0) return
    const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
    // Scroll to page 1: items shift left one slot, leaving the first slot's
    // width covered by the Back overlay.
    nav.scrollLeft = (VISIBLE_NAV_ITEMS - 1) * itemWidth
    setPage(1)
    vibrateForNavigationChange()
  }

  const handleBackClick = () => {
    const nav = navRef.current
    if (!nav) return
    nav.scrollLeft = 0
    setPage(0)
    vibrateForNavigationChange()
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="bg-primary text-white px-4 pt-3 pb-3 shadow-card">
        <div className="mx-auto max-w-2xl flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold tracking-tight">cals</h1>
            {version && (
              <span className="text-xs opacity-75" title="Frontend spike (React + Vite)">
                v{version.version}
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            {user && (
              <span className="truncate text-xs opacity-90 sm:text-sm">
                {user.name || user.email} · {user.daily_calorie_goal.toLocaleString('en-GB')} kcal
              </span>
            )}
            {session?.is_admin && (
              <button
                type="button"
                data-testid="swap-user-button"
                onClick={() => setSwapOpen(true)}
                className="shrink-0 whitespace-nowrap rounded-full border border-white/60 px-2 py-1 text-xs text-white hover:bg-white/15"
              >
                {viewingAsOther ? 'Swap' : 'Swap user'}
              </button>
            )}
            {version?.dev_identity_switch && (
              <a
                href="/dev/identity"
                className="shrink-0 whitespace-nowrap rounded-full border border-white/60 px-2 py-1 text-xs text-white no-underline hover:bg-white/15"
              >
                Switch user
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Unmistakable, always visible while acting as someone else, with the
          way back to the Admin's own account beside it. */}
      {viewingAsOther && session && (
        <div
          role="status"
          data-testid="viewing-as-banner"
          className="bg-amber-300 text-amber-950"
        >
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-2">
            <p className="text-sm font-semibold">
              Viewing as {session.acting_user.name || session.acting_user.email}
              <span className="ml-1 font-normal">
                — anything you log belongs to them
              </span>
            </p>
            <button
              type="button"
              data-testid="return-to-own-account"
              disabled={returnToOwnAccount.isPending}
              onClick={() => returnToOwnAccount.mutate()}
              className="min-h-11 shrink-0 rounded-full bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900"
            >
              Return to {session.authenticated_user.name || 'my account'}
            </button>
          </div>
        </div>
      )}

      {swapOpen && <SwapUserSheet onClose={() => setSwapOpen(false)} />}

      <main className="flex-1 mx-auto w-full max-w-2xl px-3 py-4 pb-24">
        {/* Routes are lazy-loaded (decision 101); the brief while a page chunk
            arrives shows a quiet placeholder instead of a blank main area. */}
        <Suspense
          fallback={
            <p className="px-1 py-8 text-center text-sm text-ink-light" data-testid="route-loading">
              Loading…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <nav
        aria-label="Primary navigation"
        aria-describedby="primary-navigation-hint"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-card safe-bottom"
      >
        <div className="relative mx-auto w-full max-w-2xl">
          <div
            ref={navRef}
            data-testid="primary-navigation-scroll"
            onScroll={handleNavScroll}
            className="scrollbar-hidden flex snap-x snap-mandatory touch-pan-x overflow-x-auto overscroll-x-contain"
          >
            {/* Extra empty slot at the end: when we scroll to the overflow page
                (page 1) the Back overlay covers one slot-width, so adding a
                spacer slot keeps Foods/Recipes aligned to the remaining four
                visible columns rather than disappearing under the overlay. */}
            {NAV.map((item) => (
              <NavigationLink key={item.to} item={item} />
            ))}
            <div aria-hidden className="flex-none w-1/5" />
          </div>
          {/* Overlay controls: › More sits at the far right on page 0; ‹ Back
              sits at the far left on page 1 (owner niggle, 2026-10-05: the back
              arrow must not appear in the middle of the bar). */}
          {!navOnPage1 && (
            <button
              type="button"
              data-testid="primary-navigation-more"
              aria-label="Show Foods and Recipes"
              title="Show Foods and Recipes"
              onClick={handleMoreClick}
              className="absolute right-0 top-0 bottom-0 flex w-[20%] cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-card py-2 text-xs font-medium text-ink-light hover:text-ink"
            >
              <span aria-hidden className="text-2xl leading-none">›</span>
              <span>More</span>
            </button>
          )}
          {navOnPage1 && (
            <button
              type="button"
              data-testid="primary-navigation-back"
              aria-label="Show main navigation"
              title="Show main navigation"
              onClick={handleBackClick}
              className="absolute left-0 top-0 bottom-0 flex w-[20%] cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-card py-2 text-xs font-medium text-ink-light hover:text-ink"
            >
              <span aria-hidden className="text-2xl leading-none">‹</span>
              <span>Back</span>
            </button>
          )}
        </div>
        <span id="primary-navigation-hint" className="sr-only">
          Swipe horizontally or use the arrow to reveal Foods and Recipes. Haptic feedback is used when supported.
        </span>
      </nav>
    </div>
  )
}
