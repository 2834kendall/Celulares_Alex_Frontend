'use client'

import { useRef } from 'react'
import { Character, Eye, Mouth, SCENE_INK } from '@/components/scene/SceneParts'
import { useSceneGaze, type GazeActor } from '@/components/scene/useSceneGaze'
import { BURIED_Y, STATE_VIEW_BOX, StateSvg } from './StateSvg'

const ACTORS: readonly GazeActor[] = [{ anchor: [160, 80], stiffness: 140, damping: 12 }]

/**
 * Sin acceso: un guardia (el bloque oscuro del login, con gorra) junto a un
 * candado cerrado. Serio pero no hostil. Al pasar el puntero niega con la
 * cabeza y el candado tiembla.
 */
export function GuardScene() {
  const sceneRef = useRef<SVGSVGElement>(null)

  useSceneGaze(sceneRef, STATE_VIEW_BOX, ACTORS, () => null)

  return (
    <StateSvg sceneRef={sceneRef} kind="forbidden" mood="stern">
      {(groundClip) => (
        <>
          <g className="state-lock">
            <path
              d="M62 90 V76 a12 12 0 0 1 24 0 V90"
              fill="none"
              className="stroke-brand-300"
              strokeWidth={6}
              strokeLinecap="round"
            />
            <rect x={52} y={88} width={44} height={36} rx={8} className="fill-brand-600" />
            <circle cx={74} cy={102} r={4} fill="#fff" />
            <rect x={72.5} y={104} width={3} height={8} rx={1.5} fill="#fff" />
          </g>

          <g clipPath={groundClip}>
            <Character idle="sway" delay={0.1} blink={6.2} lean={-5}>
              <path
                d={`M132 ${BURIED_Y} V64 a12 12 0 0 1 12 -12 h32 a12 12 0 0 1 12 12 V${BURIED_Y}Z`}
                fill={SCENE_INK}
              />
              {/* Gorra, con la visera hacia el candado. */}
              <rect x={134} y={42} width={52} height={12} rx={5} className="fill-brand-600" />
              <rect x={128} y={51} width={34} height={5} rx={2.5} className="fill-brand-700" />
              <g className="login-face">
                <Eye cx={150} cy={80} r={6.5} side={-1} color="#fff" />
                <Eye cx={170} cy={80} r={6.5} side={1} color="#fff" />
                <Mouth cx={160} cy={96} width={10} color="#fff" />
              </g>
            </Character>
          </g>
        </>
      )}
    </StateSvg>
  )
}
