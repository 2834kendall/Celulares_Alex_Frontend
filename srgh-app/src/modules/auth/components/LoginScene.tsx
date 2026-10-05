'use client'

import { useRef } from 'react'
import { Character, Eye, Mouth, SCENE_INK } from '@/modules/auth/components/SceneParts'
import {
  fieldPoint,
  useSceneGaze,
  type GazeActor,
  type GazeTarget,
} from '@/modules/auth/components/useSceneGaze'

/**
 * What the shapes are reacting to. Driven by the form (see LoginForm).
 * Expressions and gestures live in globals.css under the `login-` prefix;
 * where each shape LOOKS is simulated by useSceneGaze.
 */
export type LoginSceneMood =
  'idle' | 'watching' | 'hiding' | 'peeking' | 'error' | 'loading' | 'success'

const SAND = '#e6dccb'
const GROUND_Y = 380
/* The bodies keep going below the ground and the scene is clipped at it: the
   shapes stand BEHIND the ground line, so a jump only shows more body and
   never a flat base lifting off the floor. */
const BURIED_Y = GROUND_Y + 70
const GROUND_CLIP_ID = 'login-ground-clip'
const VIEW_BOX = { x: -4, y: 84, width: 480, height: 316 }

const EMAIL_INPUT_ID = 'email-input'
const PASSWORD_INPUT_ID = 'pass-input'
const SUBMIT_BUTTON_ID = 'submit-login'

/* One entry per shape, in the order they are drawn. */
const ACTORS: readonly GazeActor[] = [
  { anchor: [219, 165], stiffness: 95, damping: 11 },
  { anchor: [298, 228], stiffness: 150, damping: 13 },
  { anchor: [385, 286], stiffness: 120, damping: 10 },
  { anchor: [127, 335], stiffness: 80, damping: 9 },
]

export function LoginScene({
  mood,
  typing = false,
}: {
  mood: LoginSceneMood
  /** On while the user is typing: the characters perk up. */
  typing?: boolean
}) {
  const sceneRef = useRef<SVGSVGElement>(null)

  useSceneGaze(sceneRef, VIEW_BOX, ACTORS, (index): GazeTarget => {
    /* Turned away from the form, each one a bit differently. */
    if (mood === 'hiding') return { direction: { x: -0.75 + index * 0.1, y: 0.45 } }
    if (mood === 'error') return { direction: { x: 0, y: 1 } }
    if (mood === 'success') return { direction: { x: 0, y: -0.5 } }

    let point = null
    if (mood === 'watching') point = fieldPoint(EMAIL_INPUT_ID, true)
    else if (mood === 'peeking') point = fieldPoint(PASSWORD_INPUT_ID, true)
    else if (mood === 'loading') point = fieldPoint(SUBMIT_BUTTON_ID, false)

    return point ? { point } : null
  })

  return (
    <svg
      ref={sceneRef}
      viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      className="login-scene absolute inset-0 h-full w-full"
      data-mood={mood}
      data-typing={typing}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={GROUND_CLIP_ID}>
          <rect x={-200} y={-400} width={900} height={GROUND_Y + 400} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${GROUND_CLIP_ID})`}>
        {/* Tall block */}
        <Character idle="stretch" delay={0} blink={5.2} lean={-5} hero>
          <path
            d={`M150 ${BURIED_Y} V126 a16 16 0 0 1 16 -16 h88 a16 16 0 0 1 16 16 V${BURIED_Y}Z`}
            className="fill-brand-600"
          />
          <g className="login-face">
            <Eye cx={200} cy={165} r={12} side={-1} />
            <Eye cx={238} cy={165} r={12} side={1} />
            <Mouth cx={219} cy={194} width={16} />
          </g>
        </Character>

        {/* Slim dark block */}
        <Character idle="sway" delay={0.1} blink={6.4} lean={-7}>
          <path
            d={`M256 ${BURIED_Y} V202 a12 12 0 0 1 12 -12 h60 a12 12 0 0 1 12 12 V${BURIED_Y}Z`}
            fill={SCENE_INK}
          />
          <g className="login-face">
            <Eye cx={284} cy={228} r={9.5} side={-1} color="#fff" />
            <Eye cx={312} cy={228} r={9.5} side={1} color="#fff" />
            <Mouth cx={298} cy={250} width={12} color="#fff" />
          </g>
        </Character>

        {/* Arch */}
        <Character idle="hop" delay={0.2} blink={4.6} lean={-4}>
          <path d={`M330 ${BURIED_Y} V285 a55 55 0 0 1 110 0 V${BURIED_Y}Z`} fill={SAND} />
          <g className="login-face">
            <Eye cx={368} cy={286} r={11} side={-1} />
            <Eye cx={402} cy={286} r={11} side={1} />
            <Mouth cx={385} cy={311} width={16} />
          </g>
        </Character>

        {/* Dome */}
        <Character idle="wobble" delay={0.3} blink={5.8} lean={-2}>
          <path
            d={`M33 ${BURIED_Y} V${GROUND_Y} a92 92 0 0 1 184 0 V${BURIED_Y}Z`}
            className="fill-brand-300"
          />
          <g className="login-face">
            <Eye cx={108} cy={335} r={10} side={-1} />
            <Eye cx={146} cy={335} r={10} side={1} />
            <Mouth cx={127} cy={356} width={16} />
          </g>
        </Character>
      </g>

      <path
        d={`M8 ${GROUND_Y} H464`}
        className="stroke-brand-200"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  )
}
