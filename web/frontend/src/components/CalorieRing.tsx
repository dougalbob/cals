import { formatNumber } from '../lib/format'

/** Fixed display scale until the per-user limits are added in Phase 15 Settings. */
export const BANK_RING_LIMIT_KCAL = 2_000

/** 12 o'clock, where both the surplus and the deficit arc begin. */
const START_ROTATION_DEGREES = -90

/**
 * The SVG transform that anchors the outer bank arc at 12 o'clock and gives it a
 * sweep direction: a surplus grows clockwise (the ring's original direction) and a
 * deficit grows anticlockwise from the same start, so the sign is visible at a
 * glance rather than by colour alone (owner request, 2026-10-03).
 *
 * The anticlockwise case reflects the ring about its vertical axis. Reflecting the
 * geometry is used rather than a negative `stroke-dashoffset` because a negative
 * offset cannot draw a *full* circle — at exactly 100% the whole dash falls in the
 * gap and the ring would vanish at the limits it is meant to saturate at.
 */
export function bankArcTransform(balanceKcal: number, size: number): string {
  const centre = size / 2
  const start = `rotate(${START_ROTATION_DEGREES} ${centre} ${centre})`
  return balanceKcal < 0 ? `translate(${size} 0) scale(-1 1) ${start}` : start
}

/**
 * The daily calorie rings answer two separate questions.
 *
 * **Outer ring:** where the cumulative calorie bank sits on a fixed -2,000 to
 * +2,000 kcal display scale. Both directions start at 12 o'clock; a surplus
 * fills clockwise in green and a deficit fills anticlockwise in red, and values
 * beyond either limit saturate the ring. The exact balance remains visible in the
 * label; this is only a visual scale, not bank maths.
 *
 * **Inner ring:** today's plain daily allowance, drawn as a countdown. It
 * starts as a complete circle and drains clockwise as calories are logged.
 */
export function CalorieRing({
  consumed,
  bankBalance,
  goal,
}: {
  consumed: number
  bankBalance: number
  goal: number
}) {
  const size = 190
  const stroke = 16
  const centre = size / 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  const bankProgress = Math.min(Math.abs(bankBalance) / BANK_RING_LIMIT_KCAL, 1)
  const bankColour = bankBalance > 0 ? '#26de81' : bankBalance < 0 ? '#fc5c65' : '#edf2f7'
  const bankPercent = Math.round(bankProgress * 1_000) / 10
  const bankPercentLabel = `${formatNumber(bankPercent, Number.isInteger(bankPercent) ? 0 : 1)}%`
  const signedBankBalance = bankBalance > 0 ? `+${formatNumber(bankBalance)}` : formatNumber(bankBalance)

  // --- inner daily-goal countdown -----------------------------------------
  const innerStroke = 9
  const innerRadius = radius - stroke / 2 - innerStroke / 2 - 5
  const innerCircumference = 2 * Math.PI * innerRadius
  const allowanceLeft = Math.max(0, goal - consumed)
  const allowanceFraction = goal > 0 ? Math.min(allowanceLeft / goal, 1) : 0
  const overAllowance = goal > 0 && consumed > goal
  const innerColour = overAllowance ? '#fc5c65' : '#26de81'

  const dailySummary =
    goal > 0
      ? overAllowance
        ? `${formatNumber(consumed)} kcal consumed today, ${formatNumber(consumed - goal)} kcal over the ${formatNumber(goal)} kcal daily goal.`
        : `${formatNumber(consumed)} of ${formatNumber(goal)} kcal consumed today, ${formatNumber(allowanceLeft)} kcal of the daily goal left.`
      : `${formatNumber(consumed)} kcal consumed today; no daily calorie goal is set.`
  const bankSummary =
    bankBalance > 0
      ? `Bank balance ${signedBankBalance} kcal in surplus, with the green arc filling clockwise from 12 o'clock.`
      : bankBalance < 0
        ? `Bank balance ${signedBankBalance} kcal in deficit, with the red arc filling anticlockwise from 12 o'clock.`
        : 'Bank balance 0 kcal, with no surplus or deficit and no arc.'
  const summary = `${bankSummary} The outer ring shows ${bankPercentLabel} of its plus or minus ${formatNumber(BANK_RING_LIMIT_KCAL)} kcal display scale. ${dailySummary}`

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
          {/* Outer: cumulative bank balance, capped at ±2,000 kcal. A surplus sweeps
              clockwise from 12 o'clock; a deficit sweeps anticlockwise from there. */}
          <circle cx={centre} cy={centre} r={radius} fill="none" stroke="#edf2f7" strokeWidth={stroke} />
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            stroke={bankColour}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - bankProgress)}
            transform={bankArcTransform(bankBalance, size)}
            style={{ transition: 'stroke-dashoffset 400ms ease' }}
          />

          {/* Inner: today's own allowance, counting down. */}
          <circle
            cx={centre}
            cy={centre}
            r={innerRadius}
            fill="none"
            stroke="#edf2f7"
            strokeWidth={innerStroke}
          />
          <circle
            cx={centre}
            cy={centre}
            r={innerRadius}
            fill="none"
            stroke={innerColour}
            strokeWidth={innerStroke}
            strokeLinecap="round"
            strokeDasharray={innerCircumference}
            strokeDashoffset={innerCircumference * (1 - allowanceFraction)}
            transform={`rotate(-90 ${centre} ${centre})`}
            style={{ transition: 'stroke-dashoffset 400ms ease' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums">{formatNumber(consumed)}</span>
          <span className="text-xs text-ink-light">of {formatNumber(goal)} kcal</span>
          <span className={`mt-1 text-xs font-medium ${overAllowance ? 'text-danger' : 'text-success'}`}>
            {goal <= 0
              ? 'daily goal not set'
              : overAllowance
                ? `${formatNumber(consumed - goal)} over`
                : `${formatNumber(allowanceLeft)} left`}
          </span>
        </div>
      </div>

      <p className="m-0 text-center text-[0.7rem] leading-tight text-ink-light">
        <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: bankColour }} />
        Bank {signedBankBalance} kcal · {bankPercentLabel} of ±{formatNumber(BANK_RING_LIMIT_KCAL)} kcal scale
      </p>
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
