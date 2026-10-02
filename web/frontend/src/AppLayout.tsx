import { NavLink, Outlet } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from './api/client'
import type { User, VersionResponse } from './api/types'

const NAV = [
  { to: '/diary', label: 'Diary', icon: '📔' },
  { to: '/metrics', label: 'Metrics', icon: '📈' },
  { to: '/foods', label: 'Foods', icon: '🥗' },
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
          {user && (
            <span className="text-sm opacity-90 truncate">
              {user.name || user.email} · {user.daily_calorie_goal.toLocaleString('en-GB')} kcal
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-3 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-line safe-bottom">
        <div className="mx-auto max-w-2xl grid grid-cols-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
