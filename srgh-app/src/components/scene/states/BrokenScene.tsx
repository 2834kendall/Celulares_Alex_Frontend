'use client'

import { useRef } from 'react'
import { Character, Eye, Mouth } from '@/components/scene/SceneParts'
import { useSceneGaze, type GazeActor } from '@/components/scene/useSceneGaze'
import { cn } from '@/lib/utils/cn'
import { BURIED_Y, STATE_VIEW_BOX, StateSvg } from './StateSvg'

const ACTORS: readonly GazeActor[] = [{ anchor: [164, 74], stiffness: 95, damping: 11 }]

/* Chispas junto al bloque volcado: [x, y]. */
const SPARKS = [
  [96, 74],
  [104, 92],
] as const

/**
 * Error: algo se rompio. Un bloque volcado que larga chispas, y al lado una
 * figura preocupada (el mood `error` del login: cejas caidas, boca hacia
 * abajo y una sacudida al aparecer).
 */
export function BrokenScene() {
  const sceneRef = useRef<SVGSVGElement>(null)

  useSceneGaze(sceneRef, STATE_VIEW_BOX, ACTORS, () => null)

  return (
    <StateSvg sceneRef={sceneRef} kind="error" mood="error">
      {(groundClip) => (
        <>
          <g transform="translate(70 102) rotate(-24)">
            <rect x={-22} y={-14} width={44} height={28} rx={6} className="fill-brand-300" />
          </g>

          {SPARKS.map(([x, y], index) => (
            <g key={index} transform={`translate(${x} ${y})`}>
              <path
                // La clase de color va suelta y no pegada a un `${…}`: Tailwind
                // la busca como texto y así no la encontraba.
                className={cn('state-spark stroke-amber-400', index === 1 && 'state-spark-late')}
                d="M0 -6 V6 M-6 0 H6 M-4 -4 L4 4 M4 -4 L-4 4"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>
          ))}

          <g clipPath={groundClip}>
            <Character idle="stretch" delay={0.1} blink={4.8} lean={-4}>
              <path
                d={`M128 ${BURIED_Y} V58 a14 14 0 0 1 14 -14 h44 a14 14 0 0 1 14 14 V${BURIED_Y}Z`}
                className="fill-brand-600"
              />
              <g className="login-face">
                <Eye cx={152} cy={74} r={7} side={-1} />
                <Eye cx={176} cy={74} r={7} side={1} />
                <Mouth cx={164} cy={92} width={12} />
              </g>
            </Character>
          </g>
        </>
      )}
    </StateSvg>
  )
}
