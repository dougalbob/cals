/**
 * The weigh-in trend is a moving average taken over the weigh-ins themselves,
 * not over calendar days (decision 95): a calendar-day window comes up empty
 * whenever nobody weighed in that morning, which would make the line jump
 * rather than smooth. The result is null until three observations exist —
 * a trend over one or two points is noise — and it is never extrapolated: the
 * caller draws exactly the values it is given, so there is no forecast, no ETA
 * and no plateau claim anywhere on the chart.
 */
export function movingAverageOverWeighIns(values: number[], windowSize: number): (number | null)[] {
  const window = Math.max(1, Math.floor(windowSize))
  let seen = 0
  return values.map((_, index) => {
    seen += 1
    if (seen < 3) return null
    const start = Math.max(0, index - window + 1)
    const observed = values.slice(start, index + 1)
    return observed.reduce((sum, value) => sum + value, 0) / observed.length
  })
}
