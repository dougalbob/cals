import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, queryKeys } from '../api/client'
import type { SessionResponse, User } from '../api/types'
import { Modal } from './Modal'

/**
 * The Admin's acting-user switch (product decisions 45 and 88).
 *
 * Choosing another household account makes cals read and write their data
 * instead of the Admin's, exactly as if that person were using the app. The
 * switch is held server-side; this sheet only asks for it. Every cached query
 * is dropped afterwards, because all of it belongs to the previous account.
 *
 * Mounted only while open, so each visit starts from a clean state.
 */
export function SwapUserSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()

  const { data: session } = useQuery<SessionResponse>({
    queryKey: queryKeys.session,
    queryFn: () => apiGet<SessionResponse>('/api/session'),
  })

  // Admin-only, exactly like the Go handler: a Standard user's request is
  // refused, and this query is never even enabled for them.
  const usersQuery = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiGet<User[]>('/api/users'),
    enabled: Boolean(session?.is_admin),
  })

  // Every cached query is account-scoped, so a switch has to drop the lot
  // rather than invalidate a handful of keys.
  const afterSwitch = () => {
    queryClient.clear()
    onClose()
  }

  const switchTo = useMutation<SessionResponse, Error, number>({
    mutationFn: (userId) => apiPost<SessionResponse>('/api/session/acting-user', { user_id: userId }),
    onSuccess: afterSwitch,
  })

  const returnToSelf = useMutation<SessionResponse, Error, void>({
    mutationFn: () => apiDelete<SessionResponse>('/api/session/acting-user'),
    onSuccess: afterSwitch,
  })

  const error = switchTo.error ?? returnToSelf.error
  const accounts = usersQuery.data ?? []
  const actingId = session?.acting_user?.id
  const authenticatedId = session?.authenticated_user?.id
  const busy = switchTo.isPending || returnToSelf.isPending

  return (
    <Modal open title="Swap user" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-light">
          Choose whose data cals should show. Anything you log while swapped belongs to them, exactly
          as if they had logged it.
        </p>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error.message}
          </p>
        )}

        {usersQuery.isPending && <p className="text-sm text-ink-light">Loading accounts…</p>}

        <ul className="space-y-2">
          {accounts.map((account) => {
            const isActing = account.id === actingId
            const isSelf = account.id === authenticatedId
            return (
              <li key={account.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (isSelf ? returnToSelf.mutate() : switchTo.mutate(account.id))}
                  className={[
                    'flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left',
                    isActing ? 'border-primary bg-primary/5' : 'border-line bg-card',
                  ].join(' ')}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {account.name || account.email}
                    </span>
                    <span className="block truncate text-xs text-ink-light">
                      {isSelf ? 'Your own account' : account.email}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    {isActing
                      ? 'Viewing'
                      : isSelf
                        ? 'Return'
                        : `Swap${account.is_admin ? ' · Admin' : ''}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
