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
 * What the scene is reacting to. Driven by the form (see
 * ForgotPasswordForm). An envelope carries the request, and two of the
 * shapes from the login watch it go. They share eyes, gaze and gestures with
 * the login (`login-` rules); what is their own is under `mail-` in
 * globals.css.
 */
export type RecoverySceneMood = 'idle' | 'watching' | 'loading' | 'sent' | 'error'

const VIEW_BOX = { x: 0, y: 0, width: 480, height: 316 }
const GROUND_Y = 290
/* Same trick as the login: bodies continue below the ground and the scene is
   clipped at it, so the shapes stand behind the line. */
const BURIED_Y = GROUND_Y + 70
const GROUND_CLIP_ID = 'recovery-ground-clip'

/* Top edge of the envelope: both flaps hinge here. */
const HINGE_Y = 96

/* One entry per character, in the order they are drawn. */
const ACTORS: readonly GazeActor[] = [
  { anchor: [76, 252], stiffness: 85, damping: 9 },
  { anchor: [420, 222], stiffness: 140, damping: 12 },
  { anchor: [240, 192], stiffness: 110, damping: 10 },
]

const EMAIL_INPUT_ID = 'recovery-email-input'
const SUBMIT_BUTTON_ID = 'recovery-submit'

export function RecoveryScene({
  mood,
  typing = false,
}: {
  mood: RecoverySceneMood
  /** On while the user is typing: the characters perk up. */
  typing?: boolean
}) {
  const sceneRef = useRef<SVGSVGElement>(null)

  useSceneGaze(sceneRef, VIEW_BOX, ACTORS, (): GazeTarget => {
    if (mood === 'error') return { direction: { x: 0, y: 1 } }
    /* The companions follow the envelope as it flies off, up and away. */
    if (mood === 'sent') return { direction: { x: 0.75, y: -0.65 } }

    let point = null
    if (mood === 'watching') point = fieldPoint(EMAIL_INPUT_ID, true)
    else if (mood === 'loading') point = fieldPoint(SUBMIT_BUTTON_ID, false)

    return point ? { point } : null
  })

  return (
    <svg
      ref={sceneRef}
      viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      className="login-scene mail-scene absolute inset-0 h-full w-full"
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

      <g className="fill-brand-200">
        <circle className="mail-speck" cx={150} cy={50} r={5} />
        <circle className="mail-speck mail-speck-late" cx={352} cy={36} r={4} />
        <circle className="mail-speck" cx={40} cy={130} r={4} />
      </g>

      <g clipPath={`url(#${GROUND_CLIP_ID})`}>
        {/* Dome */}
        <Character idle="wobble" delay={0.1} blink={5.8} lean={-2}>
          <path
            d={`M6 ${BURIED_Y} V${GROUND_Y} a70 70 0 0 1 140 0 V${BURIED_Y}Z`}
            className="fill-brand-300"
          />
          <g className="login-face">
            <Eye cx={60} cy={252} r={9} side={-1} />
            <Eye cx={92} cy={252} r={9} side={1} />
            <Mouth cx={76} cy={270} width={14} />
          </g>
        </Character>

        {/* Slim dark block */}
        <Character idle="sway" delay={0.2} blink={6.4} lean={-6}>
          <path
            d={`M386 ${BURIED_Y} V198 a12 12 0 0 1 12 -12 h44 a12 12 0 0 1 12 12 V${BURIED_Y}Z`}
            fill={SCENE_INK}
          />
          <g className="login-face">
            <Eye cx={408} cy={222} r={8.5} side={-1} color="#fff" />
            <Eye cx={432} cy={222} r={8.5} side={1} color="#fff" />
            <Mouth cx={420} cy={242} width={11} color="#fff" />
          </g>
        </Character>
      </g>

      <path
        d={`M8 ${GROUND_Y} H472`}
        className="stroke-brand-200"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <ellipse className="mail-shadow" cx={240} cy={GROUND_Y} rx={70} ry={6} />

      <g className="mail-flight">
        <Character idle="float" delay={0} blink={5.4} lean={-3}>
          {/* Open flap, behind the letter. Hinged at (0,0) by the translate. */}
          <g transform={`translate(240 ${HINGE_Y})`}>
            <path
              className="mail-flap-open fill-brand-800"
              d="M-94 6 L-8 -56 Q0 -62 8 -56 L94 6Z"
            />
          </g>

          <g className="mail-letter">
            <rect
              x={176}
              y={104}
              width={128}
              height={104}
              rx={8}
              fill="#fff"
              className="stroke-brand-200"
              strokeWidth={2}
            />
            {/* pathLength normalizes the three lines so they can be "written"
                with the same dash values. */}
            <g className="stroke-brand-300" strokeWidth={4} strokeLinecap="round">
              <path className="mail-line" pathLength={100} d="M194 124 h92" />
              <path className="mail-line mail-line-2" pathLength={100} d="M194 138 h92" />
              <path className="mail-line mail-line-3" pathLength={100} d="M194 152 h54" />
            </g>
          </g>

          <rect x={140} y={92} width={200} height={140} rx={16} className="fill-brand-600" />

          {/* Closed flap, in front of the body. */}
          <g transform={`translate(240 ${HINGE_Y})`}>
            <path className="mail-flap-closed fill-brand-700" d="M-94 0 L-8 58 Q0 63 8 58 L94 0Z" />
          </g>

          <g className="login-face">
            <Eye cx={214} cy={192} r={12} side={-1} />
            <Eye cx={266} cy={192} r={12} side={1} />
            <Mouth cx={240} cy={216} width={16} />
          </g>
        </Character>
      </g>

      {/* Paper plane the envelope folds into. Drawn pointing right, centered
          on (0,0): the flight follows `offset-path`, which rotates it along
          the way. The trail draws the same route (see globals.css). */}
      <g transform="translate(240 162)">
        <path
          className="mail-trail stroke-brand-300"
          pathLength={100}
          d="M0 0 C50 30 110 10 140 -40 C165 -85 105 -110 100 -70 C95 -30 210 -110 330 -230"
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <g className="mail-plane">
          <g className="mail-plane-body">
            <path d="M58 0 L-54 -32 L-26 0Z" className="fill-brand-400" />
            <path d="M58 0 L-54 32 L-26 0Z" className="fill-brand-600" />
            <path d="M58 0 L-26 0 L-36 18Z" className="fill-brand-800" />
          </g>
        </g>
      </g>

      {/* Delivered: takes the place of the plane once it has flown away. */}
      <g transform="translate(240 156)">
        <g className="mail-done">
          <circle className="mail-done-ring stroke-brand-300" r={50} fill="none" strokeWidth={3} />
          <circle r={46} className="fill-brand-600" />
          <path
            className="mail-done-check"
            pathLength={100}
            d="M-19 1 l13 13 l25 -27"
            fill="none"
            stroke="#fff"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  )
}
