'use client'

import { useEffect, useRef, useState } from 'react'
import { Character, Eye, Mouth } from '@/components/scene/SceneParts'
import { useSceneGaze, type GazeActor } from '@/components/scene/useSceneGaze'

/**
 * Illustrated cake of the birthdays panel. It is a toy on purpose: the cake
 * follows the pointer and hops when poked (same eyes and gaze as the login
 * shapes), each candle can be blown out and lit again, and the balloons pop
 * and grow back. Purely decorative — the information lives in the list next
 * to it — so the whole SVG is hidden from assistive technology.
 *
 * Its own motion is under `dash-` in globals.css.
 */

const VIEW_BOX = { x: 0, y: 0, width: 260, height: 250 }
const ACTORS: readonly GazeActor[] = [{ anchor: [130, 182], stiffness: 100, damping: 10 }]

const CANDLES = [106, 130, 154]
const BALLOONS = [
  { x: 44, y: 78, rx: 19, ry: 24, tone: 'fill-brand-400', delay: 0 },
  { x: 216, y: 62, rx: 21, ry: 26, tone: 'fill-brand-600', delay: 0.9 },
  { x: 226, y: 138, rx: 14, ry: 18, tone: 'fill-brand-300', delay: 1.7 },
]

const BALLOON_REGROW_MS = 1500

export function BirthdayCake({
  party = false,
}: {
  /** On while something is being celebrated: the cake hops and the flames grow. */
  party?: boolean
}) {
  const sceneRef = useRef<SVGSVGElement>(null)
  const [lit, setLit] = useState(() => CANDLES.map(() => true))
  const [popped, setPopped] = useState(() => BALLOONS.map(() => false))
  const regrowTimeouts = useRef<ReturnType<typeof setTimeout>[]>([])

  useSceneGaze(sceneRef, VIEW_BOX, ACTORS, () => null)

  useEffect(() => {
    const timeouts = regrowTimeouts.current
    return () => timeouts.forEach((timeout) => clearTimeout(timeout))
  }, [])

  function toggleCandle(index: number) {
    setLit((current) => current.map((isLit, i) => (i === index ? !isLit : isLit)))
  }

  function popBalloon(index: number) {
    if (popped[index]) return
    setPopped((current) => current.map((isPopped, i) => (i === index ? true : isPopped)))
    regrowTimeouts.current.push(
      setTimeout(
        () =>
          setPopped((current) => current.map((isPopped, i) => (i === index ? false : isPopped))),
        BALLOON_REGROW_MS
      )
    )
  }

  /* With every candle out the cake is left in the dark: it looks startled
     until one is lit again. */
  const allOut = lit.every((isLit) => !isLit)

  return (
    <svg
      ref={sceneRef}
      viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      className="login-scene dash-cake absolute inset-0 h-full w-full"
      data-mood={allOut ? 'peeking' : 'idle'}
      data-party={party}
      aria-hidden="true"
      focusable="false"
    >
      {BALLOONS.map((balloon, index) => (
        <g
          key={index}
          className="dash-balloon"
          data-popped={popped[index]}
          style={{ animationDelay: `${balloon.delay}s` }}
          onClick={() => popBalloon(index)}
        >
          <path
            d={`M${balloon.x} ${balloon.y + balloon.ry + 4} q-7 22 2 42 q7 16 -3 34`}
            fill="none"
            className="stroke-brand-200"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* Regrows from the knot: the translate puts (0,0) there. */}
          <g transform={`translate(${balloon.x} ${balloon.y + balloon.ry})`}>
            <g className="dash-balloon-body">
              <ellipse cy={-balloon.ry} rx={balloon.rx} ry={balloon.ry} className={balloon.tone} />
              <path d="M-4 5 L0 -1 L4 5Z" className={balloon.tone} />
              <ellipse
                cx={-balloon.rx * 0.35}
                cy={-balloon.ry * 1.35}
                rx={balloon.rx * 0.18}
                ry={balloon.ry * 0.26}
                fill="#fff"
                opacity={0.45}
              />
            </g>
          </g>
          {/* The translate lives on its own group: a CSS transform on the
              same node would replace it and send the burst to the corner. */}
          <g transform={`translate(${balloon.x} ${balloon.y})`}>
            <g
              className="dash-balloon-burst stroke-brand-400"
              strokeWidth={2.5}
              strokeLinecap="round"
            >
              <path d="M0 -16 v-9" />
              <path d="M14 -8 l8 -5" />
              <path d="M14 8 l8 5" />
              <path d="M0 16 v9" />
              <path d="M-14 8 l-8 5" />
              <path d="M-14 -8 l-8 -5" />
            </g>
          </g>
        </g>
      ))}

      <ellipse cx={130} cy={226} rx={92} ry={9} className="fill-brand-200" />

      <Character idle="wobble" delay={0} blink={5.6} lean={-2}>
        {/* Candles sit behind the top tier so they look planted in it. */}
        {CANDLES.map((x, index) => (
          <g
            key={x}
            className="dash-candle"
            data-lit={lit[index]}
            onClick={() => toggleCandle(index)}
          >
            {/* Generous invisible target: the candle itself is 7 units wide. */}
            <rect x={x - 11} y={58} width={22} height={50} fill="transparent" />
            <rect x={x - 3.5} y={84} width={7} height={26} rx={2} fill="#fff" />
            <path
              d={`M${x - 3.5} 92 l7 -4 M${x - 3.5} 100 l7 -4`}
              className="stroke-brand-400"
              strokeWidth={2}
            />
            <path d={`M${x} 84 v-5`} stroke="#475569" strokeWidth={1.5} strokeLinecap="round" />
            <g transform={`translate(${x} 79)`}>
              <g className="dash-flame">
                <path d="M0 0 C-7 -6 -4 -14 0 -19 C4 -14 7 -6 0 0Z" fill="#f59e0b" />
                <path d="M0 -1 C-3.5 -5 -2 -9 0 -12 C2 -9 3.5 -5 0 -1Z" fill="#fde68a" />
              </g>
              <path
                className="dash-smoke"
                d="M0 -2 q-5 -6 0 -11 q5 -5 0 -11"
                fill="none"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>
          </g>
        ))}

        <rect x={88} y={106} width={84} height={50} rx={12} className="fill-brand-400" />
        <path
          d="M88 120 v-2 a12 12 0 0 1 12 -12 h60 a12 12 0 0 1 12 12 v2 q-7 9 -14 0 q-7 9 -14 0 q-7 9 -14 0 q-7 9 -14 0 q-7 9 -14 0 q-7 9 -14 0Z"
          className="fill-brand-100"
        />

        <rect x={58} y={150} width={144} height={70} rx={14} className="fill-brand-600" />
        <path
          d="M58 166 v-2 a14 14 0 0 1 14 -14 h116 a14 14 0 0 1 14 14 v2 q-9 11 -18 0 q-9 11 -18 0 q-9 11 -18 0 q-9 11 -18 0 q-9 11 -18 0 q-9 11 -18 0 q-9 11 -18 0 q-9 11 -18 0Z"
          className="fill-brand-200"
        />

        <g className="login-face">
          <Eye cx={112} cy={188} r={9.5} side={-1} />
          <Eye cx={148} cy={188} r={9.5} side={1} />
          <Mouth cx={130} cy={205} width={14} />
        </g>
      </Character>
    </svg>
  )
}
