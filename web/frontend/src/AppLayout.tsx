import { NavLink, Outlet } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from './api/client'
import type { User, VersionResponse } from './api/types'

const NAV = [
  { to: '/', label: 'Today', icon: '🏠', end: true },
  { to: '/diary', label: 'Diary', icon: '📔', end: false },
  { to: '/metrics', label: 'Metrics', icon: '📈', end: false },
  { to: '/foods', label: 'Foods', icon: '🥗', end: false },
]

export function AppLayout() {
  const { data: user } = useQuery<User>({
    queryKey: queryKeys.user,
    queryFn: () => apiGet<User>('/api/users/me'),
  })

  const { data: version } = useQuery<VersionResponse>({
    queryKey: queryKeys.version,
    queryFn: () => apiGet<VersionResponse>('/api/version'),
    staleTime: 5 * 60_000,
  })

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

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-line safe-bottom">
        <div className="mx-auto max-w-2xl grid grid-cols-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center gap-0.5 py-2 min-h-11 text-xs font-medium no-underline',
                  isActive ? 'text-primary' : 'text-ink-light hover:text-ink',
                ].join(' ')
              }
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
