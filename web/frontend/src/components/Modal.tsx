import { useEffect, type ReactNode } from 'react'

/** Bottom-sheet on mobile, centred dialog on desktop — matches the current app. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl shadow-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 bg-primary text-white px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold m-0">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 -mr-2 text-xl leading-none bg-transparent border-0 text-white cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
