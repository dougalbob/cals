import { formatNumber } from '../lib/format'

/** Fixed display scale until the per-user limits are added in Phase 15 Settings. */
export const BANK_RING_LIMIT_KCAL = 2_000

/** 12 o'clock, where both the surplus and the deficit arc begin. */
const START_ROTATION_DEGREES = -90

/**
 * The SVG transform that anchors an arc at 12 o'clock and gives it a sweep
 * direction: a positive value grows clockwise (the ring's original direction)
 * and a negative one grows anticlockwise from the same start, so the sign is
 * visible at a glance rather than by colour alone (owner request, 2026-10-03).
 *
 * The anticlockwise case reflects the ring about its vertical axis. Reflecting
 * the geometry is used rather than a negative `stroke-dashoffset` because a
 * negative offset cannot draw a *full* circle — at exactly 100% the whole dash
 * falls in the gap and the ring would vanish at the limits it is meant to
 * saturate at.
 */
export function arcTransform(signedValue: number, size: number): string {
  const centre = size / 2
  const start = `rotate(${START_ROTATION_DEGREES} ${centre} ${centre})`
  return signedValue < 0 ? `translate(${size} 0) scale(-1 1) ${start}` : start
}

/** Backwards-compatible alias: the outer ring is the bank arc. */
export const bankArcTransform = arcTransform

/** `+1,279` / `−394`, using a true minus sign rather than a hyphen. */
export function signedKcal(value: number): string {
  const rounded = Math.round(value)
  return `${rounded < 0 ? '−' : '+'}${formatNumber(Math.abs(rounded))}`
}

/**
 * The daily calorie rings answer two separate questions.
 *
 * **Outer ring:** where the cumulative calorie bank sits on a fixed -2,000 to
 * +2,000 kcal display scale. Both directions start at 12 o'clock; a surplus
 * fills clockwise in green and a deficit fills anticlockwise in red, and values
 * beyond either limit saturate the ring. The exact balance remains visible in
 * the hub; this is only a visual scale, not bank maths.
 *
 * **Inner ring:** today's plain daily allowance. Under the goal it is a
 * countdown — a complete green circle that drains clockwise as calories are
 * logged. Once the goal is passed it flips to the same convention as the outer
 * ring: a red arc growing *anticlockwise* from 12 o'clock, sized by how far the
 * overspend has eaten into another whole day's goal (owner request, 2026-10-03).
 *
 * Everything the two rings mean is printed in the hub — bank (including what is
 * left of today), the day's spend, and today's own remainder — so the card
 * needs no explanatory captions underneath.
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
  const dailyLeft = goal > 0 ? goal - consumed : 0
  const allowanceLeft = Math.max(0, dailyLeft)
  const overAllowance = goal > 0 && consumed > goal
  const overBy = overAllowance ? consumed - goal : 0
  // Under the goal the arc is what is left; over it, how deep the overspend is
  // against another full day's goal (saturating at a complete ring).
  const innerFraction =
    goal > 0 ? (overAllowance ? Math.min(overBy / goal, 1) : Math.min(allowanceLeft / goal, 1)) : 0
  const innerColour = overAllowance ? '#fc5c65' : '#26de81'

  // The hub's top line: the bank *plus* whatever is left of today — the total
  // headroom in hand right now (owner's definition, 2026-10-03).
  const totalAvailable = bankBalance + dailyLeft

  const dailySummary =
    goal > 0
      ? overAllowance
        ? `${formatNumber(consumed)} kcal consumed today, ${formatNumber(overBy)} kcal over the ${formatNumber(goal)} kcal daily goal, with the inner red arc growing anticlockwise from 12 o'clock.`
        : `${formatNumber(consumed)} of ${formatNumber(goal)} kcal consumed today, ${formatNumber(allowanceLeft)} kcal of the daily goal left, with the inner green arc counting down clockwise.`
      : `${formatNumber(consumed)} kcal consumed today; no daily calorie goal is set.`
  const bankSummary =
    bankBalance > 0
      ? `Bank balance ${signedBankBalance} kcal in surplus, with the green arc filling clockwise from 12 o'clock.`
      : bankBalance < 0
        ? `Bank balance ${signedBankBalance} kcal in deficit, with the red arc filling anticlockwise from 12 o'clock.`
        : 'Bank balance 0 kcal, with no surplus or deficit and no arc.'
  const availableSummary =
    goal > 0 ? ` Total available including today: ${signedKcal(totalAvailable)} kcal.` : ''
  const summary = `${bankSummary} The outer ring shows ${bankPercentLabel} of its plus or minus ${formatNumber(BANK_RING_LIMIT_KCAL)} kcal display scale. ${dailySummary}${availableSummary}`

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
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
            transform={arcTransform(bankBalance, size)}
            style={{ transition: 'stroke-dashoffset 400ms ease' }}
          />

          {/* Inner: today's own allowance — counting down clockwise while there is
              some left, then growing anticlockwise in red once it is overspent. */}
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
            strokeDashoffset={innerCircumference * (1 - innerFraction)}
            transform={arcTransform(overAllowance ? -1 : 1, size)}
            style={{ transition: 'stroke-dashoffset 400ms ease' }}
          />
        </svg>

        {/* Everything the rings mean, inside the hub: total headroom on top,
            the day's spend in the middle, today's own remainder underneath. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-8 text-center">
          <span
            className={`flex items-baseline gap-1 text-[0.7rem] font-medium leading-none tabular-nums ${
              totalAvailable < 0 ? 'text-danger' : 'text-success'
            }`}
          >
            <span className="text-ink-light font-normal">bank</span>
            {goal > 0 ? signedKcal(totalAvailable) : signedKcal(bankBalance)}
          </span>

          <span className="text-3xl font-semibold leading-tight tabular-nums">{formatNumber(consumed)}</span>

          {goal > 0 ? (
            <span
              className={`flex items-baseline gap-1 text-[0.7rem] font-medium leading-none tabular-nums ${
                overAllowance ? 'text-danger' : 'text-success'
              }`}
            >
              <span className="text-ink-light font-normal">daily</span>
              {signedKcal(dailyLeft)}
            </span>
          ) : (
            <span className="text-[0.7rem] leading-none text-ink-light">daily goal not set</span>
          )}
        </div>
      </div>
    </div>
  )
}
