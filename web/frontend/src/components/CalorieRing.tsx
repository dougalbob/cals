import { formatNumber, percentOf } from '../lib/format'

/**
 * The daily calorie ring — two rings, two questions.
 *
 * **Outer ring:** consumed against *today's available allowance* (daily goal +
 * bank). This is the number that decides whether the day is still on track, and
 * a tick marks where the plain daily goal sits inside it.
 *
 * **Inner ring:** today's plain daily allowance, drawn as a **countdown**. It
 * starts as a complete circle at the beginning of the day and drains clockwise
 * as food and drink are logged. When it is empty but the outer ring is not, the
 * difference is the bank being spent — which is otherwise invisible.
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

  // --- inner countdown ring ------------------------------------------------
  const innerStroke = 9
  const innerRadius = radius - stroke / 2 - innerStroke / 2 - 5
  const innerCircumference = 2 * Math.PI * innerRadius
  const allowanceLeft = Math.max(0, goal - consumed)
  const allowanceFraction = goal > 0 ? allowanceLeft / goal : 0
  const overAllowance = goal > 0 && consumed > goal
  const innerColour = overAllowance ? '#fc5c65' : '#26de81'

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

  const summary =
    `${Math.round(consumed)} of ${Math.round(available)} kcal. ` +
    (goal > 0
      ? overAllowance
        ? `${formatNumber(consumed - goal)} kcal over today's daily allowance.`
        : `${formatNumber(allowanceLeft)} kcal of today's daily allowance left.`
      : '')

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={summary}
        >
          {/* Outer: consumed / available (goal + bank) */}
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

          {/* Inner: today's own allowance, counting down */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={innerRadius}
            fill="none"
            stroke="#edf2f7"
            strokeWidth={innerStroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={innerRadius}
            fill="none"
            stroke={innerColour}
            strokeWidth={innerStroke}
            strokeLinecap="round"
            strokeDasharray={innerCircumference}
            strokeDashoffset={innerCircumference * (1 - allowanceFraction)}
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

      {goal > 0 && (
        <p className="m-0 text-center text-[0.7rem] leading-tight text-ink-light">
          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: innerColour }} />
          {overAllowance
            ? `${formatNumber(consumed - goal)} kcal over today's allowance`
            : `${formatNumber(allowanceLeft)} kcal allowance left`}
        </p>
      )}
    </div>
  )
}
