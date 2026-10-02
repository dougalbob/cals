/**
 * Minimal dependency-free SVG charts.
 *
 * The production app uses Chart.js 4 (loaded from a CDN) inside
 * web/static/js/components/metrics.js. For the spike these small SVG
 * components are enough to prove the data flow; in the real migration the
 * recommendation is react-chartjs-2 so the existing chart behaviour and look
 * carry over rather than being rewritten twice.
 */

export interface ChartPoint {
  label: string
  value: number
}

const WIDTH = 320

export function LineChart({
  points,
  height = 130,
  stroke = '#4a90d9',
  fill = true,
  valueLabel,
}: {
  points: ChartPoint[]
  height?: number
  stroke?: string
  fill?: boolean
  valueLabel?: (value: number) => string
}) {
  if (points.length < 2) {
    return <p className="text-sm text-ink-muted">Not enough data yet.</p>
  }

  const pad = { top: 10, right: 10, bottom: 20, left: 10 }
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const innerW = WIDTH - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const x = (i: number) => pad.left + (i / (points.length - 1)) * innerW
  const y = (v: number) => pad.top + (1 - (v - min) / span) * innerH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const baseline = pad.top + innerH
  const area = `${line} L${x(points.length - 1).toFixed(1)},${baseline} L${pad.left},${baseline} Z`

  const last = points[points.length - 1]
  const first = points[0]
  const middle = points[Math.floor(points.length / 2)]

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full h-auto" role="img" aria-label="Trend chart">
        {fill && <path d={area} fill={stroke} opacity={0.12} />}
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r={3.5} fill={stroke} />
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
  overColour = '#fc5c65',
}: {
  points: ChartPoint[]
  goal?: number
  height?: number
  accent?: string
  overColour?: string
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
          const over = goal !== undefined && goal > 0 && p.value > goal
          return (
            <g key={p.label}>
              <rect
                x={pad.left + i * slot + (slot - barW) / 2}
                y={pad.top + innerH - barH}
                width={barW}
                height={barH}
                rx={2}
                fill={over ? overColour : accent}
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
