import { useEffect, type ReactNode } from 'react'

let activeModalCount = 0
let savedOverflow: { root: string; body: string } | null = null

function lockPageScroll(): () => void {
  const root = document.documentElement
  const body = document.body
  if (activeModalCount === 0) {
    savedOverflow = { root: root.style.overflow, body: body.style.overflow }
  }
  activeModalCount += 1
  root.style.overflow = 'hidden'
  body.style.overflow = 'hidden'

  let released = false
  return () => {
    if (released) return
    released = true
    activeModalCount = Math.max(0, activeModalCount - 1)
    if (activeModalCount === 0 && savedOverflow) {
      root.style.overflow = savedOverflow.root
      body.style.overflow = savedOverflow.body
      savedOverflow = null
    }
  }
}

/** Bottom-sheet on mobile, centred dialog on desktop — matches the current app. */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    return lockPageScroll()
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden overscroll-none bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex w-full min-h-0 max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl bg-card shadow-card sm:max-w-lg sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="z-10 flex shrink-0 items-center justify-between bg-primary px-4 py-3 text-white">
          <h2 className="m-0 text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 min-h-11 min-w-11 cursor-pointer border-0 bg-transparent text-xl leading-none text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div
          data-modal-scroll
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 ${footer ? '' : 'safe-bottom'}`}
        >
          {children}
        </div>
        {footer && (
          <div data-modal-footer className="shrink-0 border-t border-line-light bg-card px-4 py-3 safe-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
