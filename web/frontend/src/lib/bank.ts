/**
 * The bank's window, as words.
 *
 * Since slice 14.2 the bank is the sum of (goal − consumed) over the previous N
 * completed calendar days, not an accumulation since bank_start_date (decisions
 * 66, 92); 0 means "all time", which drops the length limit but still excludes
 * unlogged days (decision 91). Every surface that prints the figure must say
 * which window it covers, so a windowed balance can never be mistaken for an
 * all-time one — that is the whole point of these two helpers.
 */

/** The standalone label: "Last 14 days", "All time", or null when unknown. */
export function bankWindowLabel(windowDays: number | undefined): string | null {
  if (windowDays === undefined || windowDays === null || !Number.isFinite(windowDays)) return null
  if (windowDays <= 0) return 'All time'
  if (windowDays === 1) return 'Last day'
  return `Last ${windowDays} days`
}

/** The same window as a sentence fragment: "the last 14 days", "all time". */
export function bankWindowPhrase(windowDays: number | undefined): string | null {
  const label = bankWindowLabel(windowDays)
  if (label === null) return null
  if (label === 'All time') return 'all time'
  if (label === 'Last day') return 'the last day'
  return `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`
}
