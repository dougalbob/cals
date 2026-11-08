import type { TrafficLight } from '../api/types'

/**
 * One nutrition traffic light.
 *
 * Extracted from the Nutrition screen (slice 14.5) so the weekly report's
 * status strip renders the identical card: one definition, one look, and the
 * colour is always paired with the screen-reader word "green/amber/red" rather
 * than carrying the meaning alone.
 */
export function StatusLight({
  label,
  light,
  value,
  sub,
}: {
  label: string
  light: TrafficLight
  value: string
  sub: string
}) {
  const dot = light === 'green' ? 'bg-success' : light === 'amber' ? 'bg-warning' : 'bg-danger'
  return (
    <div className="rounded-xl border border-line-light px-3 py-2">
      <p className="m-0 flex items-center gap-1.5 text-xs text-ink-light">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
        {label}
        <span className="sr-only">{light}</span>
      </p>
      <p className="m-0 font-semibold">{value}</p>
      <p className="m-0 text-xs text-ink-light">{sub}</p>
    </div>
  )
}
