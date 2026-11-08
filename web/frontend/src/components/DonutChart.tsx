/**
 * A minimal SVG donut chart for the macro split (decision 94 — no chart
 * library). V1 used a Chart.js doughnut; this hand-drawn SVG keeps the same
 * information (three coloured arcs for the protein/carbs/fat share of
 * calories) without adding a dependency, matching the existing LineChart /
 * BarChart approach.
 *
 * The donut shows macro *percentages* of calories from macros (protein 4 cal/g,
 * carbs 4 cal/g, fat 9 cal/g); those already come back from the weekly
 * endpoint and do not need recomputing.
 */

export interface DonutSlice {
  label: string
  value: number // percent (0–100); slices sum to ~100
  color: string
}

const SIZE = 160
const STROKE = 28
const RADIUS = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * RADIUS

export function DonutChart({
  slices,
  centerLabel,
  centerSub,
  ariaLabel = 'Macro split',
}: {
  slices: DonutSlice[]
  centerLabel?: string
  centerSub?: string
  ariaLabel?: string
}) {
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0)
  const hasData = total > 0
  // When no data, draw equal grey slices so the donut still looks like a donut
  // rather than vanishing entirely — V1 did the same with [33, 33, 34].
  const drawSlices: DonutSlice[] = hasData
    ? slices
    : [
        { label: 'Protein', value: 33, color: '#dfe6e9' },
        { label: 'Carbs', value: 33, color: '#dfe6e9' },
        { label: 'Fat', value: 34, color: '#dfe6e9' },
      ]
  const drawTotal = drawSlices.reduce((acc, s) => acc + s.value, 0)

  // Build segments with a pure reduce (no in-loop reassignment) so the
  // react-hooks/immutability lint is happy.
  const segs = drawSlices.reduce<Array<{ label: string; color: string; dasharray: string; dashoffset: number }>>(
    (acc, s) => {
      const frac = s.value / drawTotal
      const length = frac * CIRC
      const offset = acc.reduce((sum, seg) => sum + parseFloat(seg.dasharray.split(' ')[0] ?? '0'), 0)
      acc.push({
        label: s.label,
        color: s.color,
        dasharray: `${length} ${CIRC - length}`,
        dashoffset: -offset,
      })
      return acc
    },
    [],
  )

  return (
    <figure className="m-0 inline-flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="block"
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#f1f2f6"
          strokeWidth={STROKE}
        />
        {segs.map((seg, i) => (
          <circle
            key={`${seg.label}-${i}`}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE}
            strokeDasharray={seg.dasharray}
            strokeDashoffset={seg.dashoffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            strokeLinecap="butt"
            data-testid={`donut-segment-${seg.label.toLowerCase()}`}
          />
        ))}
        {centerLabel && (
          <text
            x={SIZE / 2}
            y={SIZE / 2 - (centerSub ? 4 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={18}
            fontWeight={600}
            fill="#2d3436"
          >
            {centerLabel}
          </text>
        )}
        {centerSub && (
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill="#636e72"
          >
            {centerSub}
          </text>
        )}
      </svg>
    </figure>
  )
}
