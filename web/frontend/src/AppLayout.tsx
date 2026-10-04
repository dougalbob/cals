import { useEffect, useRef, useState, type UIEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from './api/client'
import type { User, VersionResponse } from './api/types'

const NAV = [
  { to: '/', label: 'Today', icon: '🏠', end: true },
  { to: '/diary', label: 'Diary', icon: '📔', end: false },
  { to: '/calendar', label: 'Calendar', icon: '📅', end: false },
  { to: '/metrics', label: 'Metrics', icon: '📈', end: false },
  { to: '/foods', label: 'Foods', icon: '🥗', end: false },
  { to: '/recipes', label: 'Recipes', icon: '🍽️', end: false },
]

const VISIBLE_NAV_ITEMS = 5
const NAV_OVERFLOW_INSERT_INDEX = VISIBLE_NAV_ITEMS - 1

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
  const [navOverflowVisible, setNavOverflowVisible] = useState(false)

  const { data: user } = useQuery<User>({
    queryKey: queryKeys.user,
    queryFn: () => apiGet<User>('/api/users/me'),
  })

  const { data: version } = useQuery<VersionResponse>({
    queryKey: queryKeys.version,
    queryFn: () => apiGet<VersionResponse>('/api/version'),
    staleTime: 5 * 60_000,
  })

  // If a route change lands on an item outside the current five-slot window
  // (for example, following Diary → Add recipe), reveal it without haptics.
  useEffect(() => {
    const nav = navRef.current
    if (!nav || nav.clientWidth === 0) return

    const destinationIndex = NAV.findIndex(({ to, end }) =>
      end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`),
    )
    if (destinationIndex < 0) return

    // The overflow arrow sits between Metrics and Foods in the scrolling row.
    const activeIndex = destinationIndex >= NAV_OVERFLOW_INSERT_INDEX ? destinationIndex + 1 : destinationIndex
    const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
    const itemLeft = activeIndex * itemWidth
    const itemRight = itemLeft + itemWidth
    const viewportRight = nav.scrollLeft + nav.clientWidth
    if (itemLeft < nav.scrollLeft || itemRight > viewportRight) {
      const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth)
      const nextScroll = Math.min(maxScroll, Math.max(0, itemRight - nav.clientWidth))
      nav.scrollLeft = nextScroll
      navPageRef.current = Math.round(nextScroll / itemWidth)
      setNavOverflowVisible(maxScroll > 0 && nextScroll >= maxScroll - itemWidth / 2)
    }
  }, [pathname])

  const handleNavScroll = (event: UIEvent<HTMLDivElement>) => {
    const nav = event.currentTarget
    if (nav.clientWidth === 0) return
    const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
    const nextPage = Math.round(nav.scrollLeft / itemWidth)
    const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth)
    setNavOverflowVisible(maxScroll > 0 && nav.scrollLeft >= maxScroll - itemWidth / 2)
    if (nextPage === navPageRef.current) return
    navPageRef.current = nextPage
    vibrateForNavigationChange()
  }

  const handleNavOverflowClick = () => {
    const nav = navRef.current
    if (!nav || nav.clientWidth === 0) return

    const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth)
    if (maxScroll === 0) return

    const itemWidth = nav.clientWidth / VISIBLE_NAV_ITEMS
    const isAtOverflowEnd = nav.scrollLeft >= maxScroll - itemWidth / 2
    const nextScroll = isAtOverflowEnd ? 0 : maxScroll
    const currentPage = Math.round(nav.scrollLeft / itemWidth)
    const nextPage = Math.round(nextScroll / itemWidth)
    nav.scrollLeft = nextScroll
    navPageRef.current = nextPage
    setNavOverflowVisible(nextScroll > 0)
    if (currentPage !== nextPage) vibrateForNavigationChange()
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

      <main className="flex-1 mx-auto w-full max-w-2xl px-3 py-4 pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Primary navigation"
        aria-describedby="primary-navigation-hint"
        className="fixed bottom-0 left-0 right-0 z-40 overflow-hidden border-t border-line bg-card safe-bottom"
      >
        <div
          ref={navRef}
          data-testid="primary-navigation-scroll"
          onScroll={handleNavScroll}
          className="scrollbar-hidden mx-auto flex w-full max-w-2xl snap-x snap-mandatory touch-pan-x overflow-x-auto overscroll-x-contain"
        >
          {NAV.slice(0, NAV_OVERFLOW_INSERT_INDEX).map((item) => (
            <NavigationLink key={item.to} item={item} />
          ))}
          <button
            type="button"
            data-testid="primary-navigation-overflow-button"
            aria-label={navOverflowVisible ? 'Show earlier navigation destinations' : 'Show Foods and Recipes'}
            title={navOverflowVisible ? 'Show earlier navigation destinations' : 'Show Foods and Recipes'}
            onClick={handleNavOverflowClick}
            className="flex-none w-1/5 snap-start flex flex-col items-center justify-center gap-0.5 py-2 min-h-11 text-xs font-medium text-ink-light hover:text-ink bg-transparent border-0 cursor-pointer"
          >
            <span aria-hidden className="text-2xl leading-none">
              {navOverflowVisible ? '‹' : '›'}
            </span>
            <span>{navOverflowVisible ? 'Back' : 'More'}</span>
          </button>
          {NAV.slice(NAV_OVERFLOW_INSERT_INDEX).map((item) => (
            <NavigationLink key={item.to} item={item} />
          ))}
        </div>
        <span id="primary-navigation-hint" className="sr-only">
          Swipe horizontally or use the arrow to reveal Foods and Recipes. Haptic feedback is used when supported.
        </span>
      </nav>
    </div>
  )
}
