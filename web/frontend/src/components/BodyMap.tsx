import type { BodyOutline, MeasurementLatest, MeasurementPartKey } from '../api/types'
import { formatShortDate } from '../lib/format'
import { labelFor } from '../lib/measurements'

/**
 * The tappable body map (decision 67). An SVG silhouette carries one point
 * per measurement part; the female outline exposes Bust and the male outline
 * Chest (decision 98). The silhouette is 30% shorter on mobile, while every
 * point keeps its 44 px invisible hit area around the small visible dot.
 */

const VIEW_W = 240
const VIEW_H = 480

const SILHOUETTE_FILL = '#cfdbe6'
const SILHOUETTE_STROKE = '#a9bccd'

interface PointPlacement {
  x: number
  y: number
  labelSide: 'left' | 'right'
  /** Short map-side label; the sheets and aria-labels use the full name. */
  mapLabel: string
}

const PLACEMENTS: Record<BodyOutline, Partial<Record<MeasurementPartKey, PointPlacement>>> = {
  female: {
    neck_cm: { x: 120, y: 52, labelSide: 'right', mapLabel: 'Neck' },
    bust_cm: { x: 120, y: 120, labelSide: 'left', mapLabel: 'Bust' },
    waist_cm: { x: 120, y: 188, labelSide: 'right', mapLabel: 'Waist' },
    upper_arm_cm: { x: 58, y: 156, labelSide: 'left', mapLabel: 'Arm' },
    hips_cm: { x: 120, y: 256, labelSide: 'right', mapLabel: 'Hips' },
    thigh_cm: { x: 138, y: 330, labelSide: 'right', mapLabel: 'Thigh' },
  },
  male: {
    neck_cm: { x: 120, y: 52, labelSide: 'right', mapLabel: 'Neck' },
    chest_cm: { x: 120, y: 118, labelSide: 'left', mapLabel: 'Chest' },
    waist_cm: { x: 120, y: 188, labelSide: 'right', mapLabel: 'Waist' },
    upper_arm_cm: { x: 55, y: 156, labelSide: 'left', mapLabel: 'Arm' },
    hips_cm: { x: 120, y: 256, labelSide: 'right', mapLabel: 'Hips' },
    thigh_cm: { x: 136, y: 330, labelSide: 'right', mapLabel: 'Thigh' },
  },
}

function Silhouette({ outline }: { outline: BodyOutline }) {
  const common = { fill: SILHOUETTE_FILL, stroke: SILHOUETTE_STROKE, strokeWidth: 1.5 }
  const limb = { stroke: SILHOUETTE_FILL, strokeLinecap: 'round' as const }

  if (outline === 'female') {
    return (
      <>
        <circle cx="120" cy="34" r="21" {...common} />
        <rect x="111" y="50" width="18" height="16" rx="6" {...common} />
        {/* Narrower shoulders, bust curve, narrower waist, wider hips. */}
        <path
          {...common}
          d="M120 64
             C 134 64, 146 68, 151 78
             C 155 86, 154 96, 152 104
             C 157 116, 157 128, 150 139
             C 146 153, 143 168, 141 185
             C 140 205, 151 220, 155 238
             C 157 250, 148 257, 136 257
             L 104 257
             C 92 257, 83 250, 85 238
             C 89 220, 100 205, 99 185
             C 97 168, 94 153, 90 139
             C 83 128, 83 116, 88 104
             C 86 96, 85 86, 89 78
             C 94 68, 106 64, 120 64 Z"
        />
        <line x1="85" y1="94" x2="74" y2="208" strokeWidth="14" {...limb} />
        <line x1="155" y1="94" x2="166" y2="208" strokeWidth="14" {...limb} />
        <line x1="106" y1="252" x2="101" y2="446" strokeWidth="20" {...limb} />
        <line x1="134" y1="252" x2="139" y2="446" strokeWidth="20" {...limb} />
      </>
    )
  }

  return (
    <>
      <circle cx="120" cy="34" r="21" {...common} />
      <rect x="111" y="50" width="18" height="16" rx="6" {...common} />
      {/* Broader shoulders, straighter sides, narrower hips. */}
      <path
        {...common}
        d="M120 64
           C 138 64, 152 68, 158 78
           C 162 86, 161 96, 157 104
           C 151 132, 147 160, 144 185
           C 143 205, 148 218, 148 236
           C 148 249, 140 255, 130 255
           L 110 255
           C 100 255, 92 249, 92 236
           C 92 218, 97 205, 96 185
           C 93 160, 89 132, 83 104
           C 79 96, 78 86, 82 78
           C 88 68, 102 64, 120 64 Z"
      />
      <line x1="79" y1="94" x2="68" y2="210" strokeWidth="15" {...limb} />
      <line x1="161" y1="94" x2="172" y2="210" strokeWidth="15" {...limb} />
      <line x1="108" y1="250" x2="104" y2="446" strokeWidth="21" {...limb} />
      <line x1="132" y1="250" x2="136" y2="446" strokeWidth="21" {...limb} />
    </>
  )
}

export function BodyMap({
  outline,
  latest,
  onPick,
}: {
  outline: BodyOutline
  latest: MeasurementLatest
  onPick: (part: MeasurementPartKey) => void
}) {
  const placements = PLACEMENTS[outline]

  return (
    <div
      role="group"
      aria-label={`Body map, ${outline} outline`}
      data-testid="body-map"
      className="relative mx-auto w-full max-w-[175px] sm:max-w-[250px]"
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" aria-hidden>
        <Silhouette outline={outline} />
      </svg>

      {(Object.entries(placements) as [MeasurementPartKey, PointPlacement][]).map(([partKey, point]) => {
        const point_ = latest[partKey]
        const ariaLabel = point_
          ? `${labelFor(partKey)}: last ${point_.value.toFixed(1)} cm on ${formatShortDate(point_.date)}`
          : `${labelFor(partKey)}: not measured yet`

        return (
          <div key={partKey}>
            <button
              type="button"
              data-testid={`body-point-${partKey}`}
              aria-label={ariaLabel}
              onClick={() => onPick(partKey)}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:outline-2 focus-visible:outline-primary"
              style={{ left: `${(point.x / VIEW_W) * 100}%`, top: `${(point.y / VIEW_H) * 100}%` }}
            >
              <span
                aria-hidden
                className={`block h-3 w-3 rounded-full ${
                  point_
                    ? 'bg-danger shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
                    : 'border-2 border-danger bg-white'
                }`}
              />
            </button>
            <span
              aria-hidden
              className={`pointer-events-none absolute -translate-y-1/2 text-[11px] font-medium text-ink-light ${
                point.labelSide === 'right' ? 'text-left' : 'text-right'
              }`}
              style={{
                top: `${(point.y / VIEW_H) * 100}%`,
                ...(point.labelSide === 'right'
                  ? { left: `${((point.x + 34) / VIEW_W) * 100}%` }
                  : { right: `${((VIEW_W - point.x + 34) / VIEW_W) * 100}%` }),
              }}
            >
              {point.mapLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}
