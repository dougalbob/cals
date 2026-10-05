/**
 * Minimal dependency-free SVG charts.
 *
 * Decision 94 keeps these hand-written components rather than adding a chart
 * library: panning moves the *data window* the caller fetches (through the
 * `from`/`to` parameters slice 14.1 added), not a zoomed viewport, so a
 * library's zoom plugin buys less than it appears to — and the production
 * bundle stays free of a charting dependency.
 *
 * The weigh-in chart plots raw observations as points with a moving-average
 * trend line (decision 95); the goal chart draws one bar per day against the
 * goal line, green below it, amber for the first 10% over and red beyond
 * (decision 71).
 */

export interface ChartPoint {
  label: string
  value: number
}

const WIDTH = 320

/** The first 10% over goal reads amber rather than red (decision 71). */
export const AMBER_BAND = 0.1

/** Which band a day's total falls in, relative to the goal (decision 71). */
export function goalBand(value: number, goal: number, amberThreshold = AMBER_BAND): 'under' | 'amber' | 'over' {
  if (goal <= 0 || value <= goal) return 'under'
  if (value <= goal * (1 + amberThreshold)) return 'amber'
  return 'over'
}

/**
 * The trend line, skipping gaps rather than bridging them: a null breaks the
 * line, so sparse weigh-ins never look like measured data (decision 95). A
 * single averaged point — the first three weigh-ins — is drawn as a dot rather
 * than a segment, so the trend appears exactly when decision 95 says it does.
 */
function trendMarks(
  trend: (number | null)[] | undefined,
  x: (index: number) => number,
  y: (value: number) => number,
): { segments: string[]; points: { x: number; y: number }[] } {
  const segments: string[] = []
  const points: { x: number; y: number }[] = []
  if (!trend) return { segments, points }

  let current: { x: number; y: number }[] = []
  const flush = () => {
    if (current.length > 1) {
      segments.push(
        current.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
      )
    } else if (current.length === 1) {
      points.push(current[0])
    }
    current = []
  }

  trend.forEach((value, index) => {
    if (value == null) {
      flush()
      return
    }
    current.push({ x: x(index), y: y(value) })
  })
  flush()
  return { segments, points }
}

export function LineChart({
  points,
  height = 130,
  stroke = '#4a90d9',
  fill = true,
  valueLabel,
  trend,
  minSpan = 0,
  dots = false,
  trendStroke = '#b2bec3',
  ariaLabel = 'Trend chart',
}: {
  points: ChartPoint[]
  height?: number
  stroke?: string
  fill?: boolean
  valueLabel?: (value: number) => string
  /** Moving average over the same observations, nulls allowed for gaps. */
  trend?: (number | null)[]
  /**
   * Least height of the y-axis in value units. Weight needs it: a 0.4 kg
   * wobble auto-fitted to a 30-day window reads as a crisis (decision 70).
   */
  minSpan?: number
  /** Raw points as dots only — the weigh-in chart's honest shape (decision 95). */
  dots?: boolean
  trendStroke?: string
  ariaLabel?: string
}) {
  if (points.length < 2) {
    return <p className="text-sm text-ink-muted">Not enough data yet.</p>
  }

  const pad = { top: 10, right: 10, bottom: 20, left: 10 }
  const observed = [
    ...points.map((p) => p.value),
    ...(trend ?? []).filter((value): value is number => value != null),
  ]
  let min = Math.min(...observed)
  let max = Math.max(...observed)
  // Centre a too-narrow range on the data so the padding is symmetric.
  if (minSpan > 0 && max - min < minSpan) {
    const middle = (min + max) / 2
    min = middle - minSpan / 2
    max = middle + minSpan / 2
  }
  const span = max - min || 1
  const innerW = WIDTH - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const x = (i: number) => pad.left + (i / (points.length - 1)) * innerW
  const y = (v: number) => pad.top + (1 - (v - min) / span) * innerH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const baseline = pad.top + innerH
  const area = `${line} L${x(points.length - 1).toFixed(1)},${baseline} L${pad.left},${baseline} Z`
  const marks = trendMarks(trend, x, y)

  const last = points[points.length - 1]
  const first = points[0]
  const middle = points[Math.floor(points.length / 2)]

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        {!dots && fill && <path d={area} fill={stroke} opacity={0.12} />}
        {!dots && (
          <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {dots &&
          points.map((p, i) => (
            <circle key={`${p.label}-${i}`} cx={x(i)} cy={y(p.value)} r={2.6} fill={stroke} />
          ))}
        {marks.segments.map((segment, i) => (
          <path
            key={i}
            d={segment}
            fill="none"
            stroke={trendStroke}
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            data-testid="trend-segment"
          />
        ))}
        {marks.points.map((point, i) => (
          <circle key={`trend-${i}`} cx={point.x} cy={point.y} r={2} fill={trendStroke} data-testid="trend-point" />
        ))}
        {!dots && <circle cx={x(points.length - 1)} cy={y(last.value)} r={3.5} fill={stroke} />}
        <text x={pad.left} y={height - 6} fontSize={9} fill="#636e72">
          {first.label}
        </text>
        <text x={WIDTH / 2} y={height - 6} fontSize={9} fill="#636e72" textAnchor="middle">
          {middle.label}
        </text>
        <text x={WIDTH - pad.right} y={height - 6} fontSize={9} fill="#636e72" textAnchor="end">
          {last.label}
        </text>
        {valueLabel && (
          <text x={WIDTH - pad.right} y={pad.top + 4} fontSize={10} fill="#2d3436" textAnchor="end" fontWeight={600}>
            {valueLabel(last.value)}
          </text>
        )}
      </svg>
    </figure>
  )
}

export function BarChart({
  points,
  goal,
  height = 140,
  accent = '#4a90d9',
  amberColour = '#fed330',
  overColour = '#fc5c65',
  bands = false,
}: {
  points: ChartPoint[]
  goal?: number
  height?: number
  accent?: string
  amberColour?: string
  overColour?: string
  /** Green/amber/red against the goal line (decision 71); off by default. */
  bands?: boolean
}) {
  if (points.length === 0) {
    return <p className="text-sm text-ink-muted">Not enough data yet.</p>
  }

  const pad = { top: 12, right: 8, bottom: 20, left: 8 }
  const innerW = WIDTH - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const max = Math.max(goal ?? 0, ...points.map((p) => p.value)) * 1.08 || 1
  const slot = innerW / points.length
  const barW = Math.max(4, slot * 0.62)

  const y = (v: number) => pad.top + (1 - v / max) * innerH

  const labelEvery = Math.ceil(points.length / 5)

  const colourFor = (value: number) => {
    if (!bands || goal === undefined || goal <= 0) {
      return goal !== undefined && goal > 0 && value > goal ? overColour : accent
    }
    const band = goalBand(value, goal)
    if (band === 'amber') return amberColour
    if (band === 'over') return overColour
    return accent
  }

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full h-auto" role="img" aria-label="Daily totals">
        {goal !== undefined && goal > 0 && (
          <>
            <line x1={pad.left} x2={WIDTH - pad.right} y1={y(goal)} y2={y(goal)} stroke="#b2bec3" strokeWidth={1} strokeDasharray="4 3" />
            <text x={WIDTH - pad.right} y={y(goal) - 3} fontSize={9} fill="#636e72" textAnchor="end">
              goal {Math.round(goal).toLocaleString('en-GB')}
            </text>
          </>
        )}
        {points.map((p, i) => {
          const barH = Math.max(1, (p.value / max) * innerH)
          return (
            <g key={`${p.label}-${i}`}>
              <rect
                x={pad.left + i * slot + (slot - barW) / 2}
                y={pad.top + innerH - barH}
                width={barW}
                height={barH}
                rx={2}
                fill={colourFor(p.value)}
              />
              {i % labelEvery === 0 && (
                <text x={pad.left + i * slot + slot / 2} y={height - 6} fontSize={9} fill="#636e72" textAnchor="middle">
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
