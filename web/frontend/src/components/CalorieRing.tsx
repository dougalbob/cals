import { formatNumber, percentOf } from '../lib/format'

/**
 * The daily calorie ring: consumed vs today's available allowance
 * (goal + bank), with a tick marking where the plain daily goal sits.
 */
export function CalorieRing({
  consumed,
  available,
  goal,
}: {
  consumed: number
  available: number
  goal: number
}) {
  const size = 190
  const stroke = 16
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = percentOf(consumed, available) / 100
  const over = consumed > available
  const colour = over ? '#fc5c65' : '#4a90d9'
  const remaining = available - consumed

  // Tick at the plain daily goal, so a "banked" day is obvious.
  const goalAngle = -90 + (percentOf(goal, available) / 100) * 360
  const tickInner = radius - stroke / 2 - 3
  const tickOuter = radius + stroke / 2 + 3
  const toXY = (angleDeg: number, r: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return { x: size / 2 + r * Math.cos(rad), y: size / 2 + r * Math.sin(rad) }
  }
  const tickA = toXY(goalAngle, tickInner)
  const tickB = toXY(goalAngle, tickOuter)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(consumed)} of ${Math.round(available)} kcal`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#edf2f7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
        {goal > 0 && goal < available && (
          <line x1={tickA.x} y1={tickA.y} x2={tickB.x} y2={tickB.y} stroke="#636e72" strokeWidth={2} strokeLinecap="round" />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums">{formatNumber(consumed)}</span>
        <span className="text-xs text-ink-light">of {formatNumber(available)} kcal</span>
        <span className={`mt-1 text-xs font-medium ${over ? 'text-danger' : 'text-success'}`}>
          {over
            ? `${formatNumber(-remaining)} over`
            : `${formatNumber(remaining)} left`}
        </span>
      </div>
    </div>
  )
}
