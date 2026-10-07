import type { CSSProperties, ReactNode } from 'react'

/**
 * Building blocks for the illustrated scenes of the app: an eye, a mouth and
 * the frame of a character. Any module composes its own figures from them
 * (the login shapes, the recovery envelope, the dashboard sun and cake) by
 * drawing a body and placing a face on it.
 *
 * They only draw. Expressions and gestures are CSS, and the gaze comes from
 * useSceneGaze. The class names keep the `login-` prefix of the first screen
 * that used them: for any scene to get them, its <svg> needs the
 * `login-scene` class and, for moods, a `data-mood` attribute.
 */

export const SCENE_INK = '#131c36'

export function Eye({
  cx,
  cy,
  r,
  side,
  color = SCENE_INK,
}: {
  cx: number
  cy: number
  r: number
  side: -1 | 1
  /** Brow and eyelid color: must contrast with the body behind the eye. */
  color?: string
}) {
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      style={{ '--eye-travel': `${(r * 0.44).toFixed(1)}px`, '--brow-side': side } as CSSProperties}
    >
      {/* Sizing wrappers carry no transform attribute: their default origin
          (0,0) is the eye center, so growing them keeps the eye in place. */}
      <g className="login-eye-size">
        <path
          className="login-brow"
          d={`M${-r * 0.75} ${-r * 1.75} h${r * 1.5}`}
          stroke={color}
          strokeWidth={2.8}
          strokeLinecap="round"
        />
        <g className="login-eye-open">
          <g className="login-eye-blink">
            <circle r={r} fill="#fff" />
            <g className="login-pupil">
              <g className="login-pupil-size">
                <circle r={r * 0.5} fill={SCENE_INK} />
                <circle cx={-r * 0.16} cy={-r * 0.2} r={r * 0.15} fill="#fff" />
              </g>
            </g>
          </g>
        </g>
        <path
          className="login-eye-lid"
          d={`M${-r} ${-r * 0.1} q${r} ${r * 0.8} ${r * 2} 0`}
          fill="none"
          stroke={color}
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      </g>
    </g>
  )
}

export function Mouth({
  cx,
  cy,
  width,
  color = SCENE_INK,
}: {
  cx: number
  cy: number
  width: number
  color?: string
}) {
  const half = width / 2

  return (
    <g transform={`translate(${cx} ${cy})`}>
      <path
        className="login-mouth-curve"
        d={`M${-half} 0 q${half} ${half * 0.85} ${width} 0`}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <ellipse
        className="login-mouth-o"
        cy={half * 0.3}
        rx={half * 0.5}
        ry={half * 0.62}
        fill={color}
      />
    </g>
  )
}

/**
 * A character of the scene. The nested groups are one per kind of motion, so
 * they can overlap without fighting over the same `transform`: entrance,
 * jumps (loading / error / poke), idle fidget, and the lean that follows the
 * gaze.
 */
export function Character({
  idle,
  delay,
  blink,
  lean,
  hero = false,
  children,
}: {
  /** Suffix of the `login-idle-*` keyframes: each one fidgets its own way. */
  idle: 'stretch' | 'sway' | 'hop' | 'wobble' | 'float'
  delay: number
  blink: number
  lean: number
  /** The one that takes over the screen on the way out (see playLoginSuccess). */
  hero?: boolean
  children: ReactNode
}) {
  return (
    <g
      className="login-character"
      data-character=""
      data-hero={hero ? '' : undefined}
      style={
        {
          '--char-delay': `${delay}s`,
          '--blink': `${blink}s`,
          '--lean': `${lean}deg`,
        } as CSSProperties
      }
    >
      <g className="login-rise">
        <g className="login-pop">
          <g className={`login-idle login-idle-${idle}`}>
            <g className="login-lean">{children}</g>
          </g>
        </g>
      </g>
    </g>
  )
}
