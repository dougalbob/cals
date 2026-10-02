import { useId } from 'react'

/**
 * A glass that starts the day **full** and drains as water is logged.
 *
 * The level is deliberately *what is left to drink*, not what has been drunk:
 * an empty glass at the end of the day is the goal state, and "one more glass"
 * is visible as the gap at the top.
 *
 * `level` is the remaining fraction of the target (0 = empty, 1 = full).
 */
export function WaterGlass({
  level,
  width = 74,
  height = 106,
  label,
}: {
  /** Remaining fraction of the daily target: 1 = full, 0 = drained. */
  level: number
  width?: number
  height?: number
  label?: string
}) {
  const clipId = useId()
  const gradientId = useId()

  // Geometry in viewBox units (0 0 64 106): a tapered tumbler.
  const topY = 10
  const bottomY = 98
  const glassPath =
    'M11 10 L15 88 C15.4 93.5 18 98 23 98 L41 98 C46 98 48.6 93.5 49 88 L53 10 Z'

  const clamped = Math.max(0, Math.min(1, level))
  const surfaceY = bottomY - clamped * (bottomY - topY)
  const waterHeight = bottomY - surfaceY

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 64 106"
      role="img"
      aria-label={label ?? `Water remaining: ${Math.round(clamped * 100)}%`}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={glassPath} />
        </clipPath>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>

      {/* Glass body */}
      <path d={glassPath} fill="#ffffff" />

      {/* Water, clipped to the inside of the glass */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x="0"
          y={surfaceY}
          width="64"
          height={waterHeight}
          fill={`url(#${gradientId})`}
          style={{ transition: 'y 400ms ease, height 400ms ease' }}
        />
        {/* Surface highlight — a slightly lighter band where the water meets air */}
        {waterHeight > 0 && (
          <rect x="0" y={surfaceY} width="64" height="2.5" fill="#bae6fd" opacity="0.9" />
        )}
        {/* A couple of bubbles, purely to read as water rather than a bar */}
        {waterHeight > 18 && (
          <>
            <circle cx="24" cy={surfaceY + waterHeight * 0.45} r="1.6" fill="#ffffff" opacity="0.45" />
            <circle cx="38" cy={surfaceY + waterHeight * 0.7} r="1.1" fill="#ffffff" opacity="0.35" />
          </>
        )}
        {/* Glass shine */}
        <rect x="17" y="16" width="5" height="66" rx="2.5" fill="#ffffff" opacity="0.25" />
      </g>

      {/* Outline drawn last so the water never covers the rim */}
      <path d={glassPath} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M8 8 L56 8" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
