import { Suspense, useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent, type UIEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, queryKeys } from './api/client'
import type { SessionResponse, VersionResponse } from './api/types'
import { SwapUserSheet } from './components/SwapUserSheet'
import { RemindersBell } from './components/RemindersBell'
import { vibrate } from './lib/preferences'

const NAV = [
  { to: '/', label: 'Today', icon: '🏠', end: true },
  { to: '/diary', label: 'Diary', icon: '📔', end: false },
  { to: '/calendar', label: 'Calendar', icon: '📅', end: false },
  { to: '/metrics', label: 'Metrics', icon: '📈', end: false },
  { to: '/nutrition', label: 'Nutrition', icon: '🥗', end: false },
  { to: '/foods', label: 'Foods', icon: '🍲', end: false },
  { to: '/recipes', label: 'Recipes', icon: '🍽️', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙️', end: false },
]

/**
 * Number of slots visible at a time in the bottom nav. With 8 destinations the
 * first page shows Today/Diary/Calendar/Metrics/Nutrition; the › button on the
 * right reveals Foods/Recipes/Settings, and a ‹ Back button at the far left returns.
 * The back button sits on the far left of the bar as an overlay (owner
 * niggle, session 2026-10-05) so it never lands in the middle of the row.
 */
const VISIBLE_NAV_ITEMS = 5

type OverlayTouchGesture = {
  source: 'more' | 'back'
  startX: number
  startScrollLeft: number
  moved: boolean
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
  const overlayTouchRef = useRef<OverlayTouchGesture | null>(null)
  const suppressedOverlayClickRef = useRef<'more' | 'back' | null>(null)
  // Page 0 (default, five slots visible) shows the › More overlay on the far
  // right; page 1 (scrolled to reveal Foods/Recipes/Settings) shows ‹ Back on the far
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

  // The More/Back controls sit above the scroller as overlays. A finger that
  // starts there cannot trigger the scroller's native pan, so forward that
  // gesture to its scroll position while preserving taps on the arrows.
  const handleOverlayTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    suppressedOverlayClickRef.current = null
    if (!(event.target instanceof Element)) return

    const source = event.target.closest('[data-navigation-overlay="more"]')
      ? 'more'
      : event.target.closest('[data-navigation-overlay="back"]')
        ? 'back'
        : null
    const nav = navRef.current
    if (!source || !nav || event.touches.length !== 1) {
      overlayTouchRef.current = null
      return
    }

    overlayTouchRef.current = {
      source,
      startX: event.touches[0].clientX,
      startScrollLeft: nav.scrollLeft,
      moved: false,
    }
  }

  const handleOverlayTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = overlayTouchRef.current
    const nav = navRef.current
    if (!gesture || !nav || event.touches.length !== 1) return

    const delta = gesture.startX - event.touches[0].clientX
    if (!gesture.moved && Math.abs(delta) < 8) return
    gesture.moved = true

    const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth)
    nav.scrollLeft = Math.max(0, Math.min(maxScroll, gesture.startScrollLeft + delta))
  }

  const handleOverlayTouchEnd = () => {
    const gesture = overlayTouchRef.current
    overlayTouchRef.current = null
    if (!gesture?.moved) return

    const nav = navRef.current
    if (!nav || nav.clientWidth === 0) return

    const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
    const nextPage = nav.scrollLeft > itemWidth / 2 ? 1 : 0
    const pageChanged = nextPage !== navPageRef.current
    if (pageChanged) vibrate(10)
    setPage(nextPage)
    // If the finger only moved partway, don't let its synthetic click also
    // activate More/Back. A new touch or mouse press clears this guard.
    if (!pageChanged) suppressedOverlayClickRef.current = gesture.source
  }

  // If a route change lands on an overflow item (Foods/Recipes/Settings), scroll the
  // nav so the Back overlay appears and the item is in view. Page 0 (default)
  // shows the first five; page 1 reveals Foods/Recipes/Settings with a ‹ Back on the
  // far left.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const destinationIndex = NAV.findIndex(({ to, end }) =>
      end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`),
    )
    if (destinationIndex < 0) return

    // Destinations at index ≥ VISIBLE_NAV_ITEMS live on page 1 (Foods/Recipes/Settings).
    // Nutrition is at index 4 (last visible slot), so it stays on page 0.
    const wantPage = destinationIndex >= VISIBLE_NAV_ITEMS ? 1 : 0

    // Scroll position is set on the next frame so the nav has its real width
    // in jsdom as well as in the browser; synchronously reading clientWidth
    // on first render returned 0 in tests. With a 20%-wide Back overlay on
    // the left of page 1, scrolling by THREE item widths puts Today/Diary/
    // Meals off-screen-left, slides Metrics under the Back overlay as peek
    // context, and lands Foods in slot 1 and Recipes in slot 2 — both ≥50%
    // visible as the navigation e2e expects.
    requestAnimationFrame(() => {
      if (!nav || nav.clientWidth === 0) return
      const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
      const nextScroll = wantPage === 1 ? 3 * itemWidth : 0
      if (Math.abs(nav.scrollLeft - nextScroll) > 1) {
        nav.scrollLeft = nextScroll
      }
      setPage(wantPage)
    })
  }, [pathname, setPage])

  const handleNavScroll = (event: UIEvent<HTMLDivElement>) => {
    const nav = event.currentTarget
    if (overlayTouchRef.current?.moved || nav.clientWidth === 0) return
    const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
    const nextPage = nav.scrollLeft > itemWidth / 2 ? 1 : 0
    if (nextPage === navPageRef.current) return
    setPage(nextPage)
    vibrate(10)
  }

  const handleMoreClick = () => {
    if (suppressedOverlayClickRef.current === 'more') {
      suppressedOverlayClickRef.current = null
      return
    }
    const nav = navRef.current
    if (!nav || nav.clientWidth === 0) return
    const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
    // Scroll to page 1: items shift left three slots so Foods/Recipes/Settings land
    // in the middle of the five-slot viewport, both ≥50% visible (e2e
    // requires it). The Back overlay covers the first slot, where Metrics
    // sits as peek context.
    nav.scrollLeft = 3 * itemWidth
    setPage(1)
    vibrate(10)
  }

  const handleBackClick = () => {
    if (suppressedOverlayClickRef.current === 'back') {
      suppressedOverlayClickRef.current = null
      return
    }
    const nav = navRef.current
    if (!nav) return
    nav.scrollLeft = 0
    setPage(0)
    vibrate(10)
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
            {/* The reminders bell (decisions 121–122) acts for whoever is on
                screen, including a "Viewing as" identity. */}
            <RemindersBell />
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
        <div
          className="relative mx-auto w-full max-w-2xl"
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') suppressedOverlayClickRef.current = null
          }}
          onTouchStart={handleOverlayTouchStart}
          onTouchMove={handleOverlayTouchMove}
          onTouchEnd={handleOverlayTouchEnd}
          onTouchCancel={handleOverlayTouchEnd}
        >
          <div
            ref={navRef}
            data-testid="primary-navigation-scroll"
            onScroll={handleNavScroll}
            className="scrollbar-hidden flex snap-x snap-mandatory touch-pan-x overflow-x-auto overscroll-x-contain"
          >
            {/* Eight destinations at w-1/5. On page 1 we scroll by three item
                widths so Metrics sits under the left Back overlay (peek
                context) and Foods/Recipes/Settings land in the visible slots — both
                ≥50% in viewport as the nav e2e requires. */}
            {NAV.map((item) => (
              <NavigationLink key={item.to} item={item} />
            ))}
          </div>
          {/* Overlay controls: › More sits at the far right on page 0; ‹ Back
              sits at the far left on page 1 (owner niggle, 2026-10-05: the back
              arrow must not appear in the middle of the bar). */}
          {!navOnPage1 && (
            <button
              type="button"
              data-testid="primary-navigation-more"
              data-navigation-overlay="more"
              aria-label="Show Foods, Recipes and Settings"
              title="Show Foods, Recipes and Settings"
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
              data-navigation-overlay="back"
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
          Swipe horizontally or use the arrow to reveal Foods, Recipes and Settings. Haptic feedback is used when supported.
        </span>
      </nav>
    </div>
  )
}
