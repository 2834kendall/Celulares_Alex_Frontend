'use client'

import { useRef } from 'react'
import { Character, Eye, Mouth } from '@/components/scene/SceneParts'
import { useSceneGaze, type GazeActor } from '@/components/scene/useSceneGaze'

/**
 * Illustration of the dashboard greeting: a small desk-at-the-window scene
 * that follows the time of day of the greeting next to it. By day a sun with
 * turning rays; at night a moon among stars. A cloud, a steaming mug and a
 * potted plant keep it company. All of them follow the pointer and hop when
 * poked, like every scene built on SceneParts.
 *
 * Decorative: the SVG is hidden from assistive technology. Its own motion is
 * under `dash-` in globals.css.
 */
export type DayPeriod = 'morning' | 'afternoon' | 'night'

const VIEW_BOX = { x: 0, y: 0, width: 320, height: 160 }
const GROUND_Y = 142

/* One entry per character, in the order they are drawn. */
const ACTORS: readonly GazeActor[] = [
  { anchor: [252, 46], stiffness: 90, damping: 10 },
  { anchor: [118, 46], stiffness: 70, damping: 9 },
  { anchor: [92, 116], stiffness: 130, damping: 11 },
  { anchor: [194, 124], stiffness: 110, damping: 10 },
]

const SUN = '#fbbf24'
const MOON = '#e8edf7'
const POT = '#e6dccb'
const STARS = [
  [200, 22, 3.2],
  [296, 82, 2.6],
  [222, 78, 2],
  [176, 54, 2.4],
] as const
const RAYS = Array.from({ length: 8 }, (_, index) => index * 45)

export function DayScene({ period }: { period: DayPeriod }) {
  const sceneRef = useRef<SVGSVGElement>(null)
  const isNight = period === 'night'

  useSceneGaze(sceneRef, VIEW_BOX, ACTORS, () => null)

  return (
    <svg
      ref={sceneRef}
      viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      className="login-scene dash-day absolute inset-0 h-full w-full"
      data-mood="idle"
      data-period={period}
      aria-hidden="true"
      focusable="false"
    >
      {isNight &&
        STARS.map(([x, y, size], index) => (
          <g key={index} transform={`translate(${x} ${y})`}>
            <path
              className="dash-star fill-brand-300"
              style={{ animationDelay: `${index * 0.7}s` }}
              d={`M0 ${-size * 2} L${size * 0.6} ${-size * 0.6} L${size * 2} 0 L${size * 0.6} ${size * 0.6} L0 ${size * 2} L${-size * 0.6} ${size * 0.6} L${-size * 2} 0 L${-size * 0.6} ${-size * 0.6}Z`}
            />
          </g>
        ))}

      {/* Sun or moon */}
      <Character idle="float" delay={0} blink={5.4} lean={-3}>
        {isNight ? (
          <>
            <circle cx={252} cy={48} r={27} fill={MOON} />
            <circle cx={266} cy={36} r={4.5} className="fill-brand-100" />
            <circle cx={238} cy={62} r={3} className="fill-brand-100" />
            <circle cx={270} cy={58} r={2.2} className="fill-brand-100" />
          </>
        ) : (
          <>
            {/* The translate puts (0,0) at the center, where the rays turn. */}
            <g transform="translate(252 48)">
              <g className="dash-rays" stroke={SUN} strokeWidth={4} strokeLinecap="round">
                {RAYS.map((angle) => (
                  <path key={angle} d="M0 -33 v-9" transform={`rotate(${angle})`} />
                ))}
              </g>
            </g>
            <circle cx={252} cy={48} r={26} fill={SUN} />
          </>
        )}
        <g className="login-face">
          <Eye cx={243} cy={45} r={6} side={-1} />
          <Eye cx={261} cy={45} r={6} side={1} />
          <Mouth cx={252} cy={58} width={10} />
        </g>
      </Character>

      {/* Cloud */}
      <g className="dash-cloud">
        <Character idle="float" delay={0.15} blink={6.2} lean={-2}>
          <path
            d="M88 62 a15 15 0 0 1 3 -29 a19 19 0 0 1 35 -7 a16 16 0 0 1 24 13 a12 12 0 0 1 -3 23Z"
            fill="#fff"
            className="stroke-brand-200"
            strokeWidth={2}
          />
          <g className="login-face">
            <Eye cx={109} cy={45} r={5.5} side={-1} />
            <Eye cx={127} cy={45} r={5.5} side={1} />
            <Mouth cx={118} cy={54} width={8} />
          </g>
        </Character>
      </g>

      <path
        d={`M12 ${GROUND_Y} H308`}
        className="stroke-brand-200"
        strokeWidth={3}
        strokeLinecap="round"
      />

      {/* Mug */}
      <Character idle="wobble" delay={0.25} blink={4.8} lean={-4}>
        <g className="stroke-brand-300" fill="none" strokeWidth={2.5} strokeLinecap="round">
          <path className="dash-steam" d="M84 88 q-5 -7 0 -13 q5 -6 0 -12" />
          <path className="dash-steam dash-steam-late" d="M100 88 q-5 -7 0 -13 q5 -6 0 -12" />
        </g>
        <path
          d="M114 106 q17 1 15 15 q-2 13 -15 11"
          fill="none"
          className="stroke-brand-600"
          strokeWidth={6}
          strokeLinecap="round"
        />
        <path
          d={`M68 96 h48 v${GROUND_Y - 108} a12 12 0 0 1 -12 12 h-24 a12 12 0 0 1 -12 -12Z`}
          className="fill-brand-600"
        />
        <rect x={68} y={93} width={48} height={6} rx={3} className="fill-brand-700" />
        <g className="login-face">
          <Eye cx={83} cy={116} r={6.5} side={-1} />
          <Eye cx={101} cy={116} r={6.5} side={1} />
          <Mouth cx={92} cy={129} width={10} />
        </g>
      </Character>

      {/* Potted plant */}
      <Character idle="sway" delay={0.35} blink={5.8} lean={-3}>
        <g className="dash-leaves">
          <path
            d="M194 110 C176 102 172 78 182 66 C192 80 196 96 194 110Z"
            className="fill-brand-400"
          />
          <path
            d="M194 110 C212 104 220 84 214 70 C202 80 194 96 194 110Z"
            className="fill-brand-300"
          />
          <path
            d="M194 110 C189 90 193 66 200 54 C205 72 203 94 194 110Z"
            className="fill-brand-500"
          />
        </g>
        <path d={`M172 108 h44 l-6 ${GROUND_Y - 108} h-32Z`} fill={POT} />
        <rect x={169} y={104} width={50} height={8} rx={4} fill="#d8ccb6" />
        <g className="login-face">
          <Eye cx={186} cy={124} r={5.5} side={-1} />
          <Eye cx={202} cy={124} r={5.5} side={1} />
          <Mouth cx={194} cy={133} width={8} />
        </g>
      </Character>
    </svg>
  )
}
