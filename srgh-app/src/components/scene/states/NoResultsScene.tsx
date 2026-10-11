'use client'

import { useRef } from 'react'
import { Character, Eye, Mouth } from '@/components/scene/SceneParts'
import { useSceneGaze, type GazeActor } from '@/components/scene/useSceneGaze'
import { BURIED_Y, STATE_VIEW_BOX, StateSvg } from './StateSvg'

const SAND = '#e6dccb'

const ACTORS: readonly GazeActor[] = [{ anchor: [128, 99], stiffness: 110, damping: 10 }]

/**
 * Sin resultados: la busqueda no encontro nada. Una figura desconcertada (una
 * ceja arriba, boca torcida) mientras una lupa barre al costado y aparece un
 * "?". La mirada queda libre: sigue al puntero o mira alrededor.
 */
export function NoResultsScene() {
  const sceneRef = useRef<SVGSVGElement>(null)

  useSceneGaze(sceneRef, STATE_VIEW_BOX, ACTORS, () => null)

  return (
    <StateSvg sceneRef={sceneRef} kind="no-results" mood="confused">
      {(groundClip) => (
        <>
          {/* Grupo propio para la animacion: no se anima un nodo con transform. */}
          <g className="state-sweep">
            <circle
              cx={62}
              cy={74}
              r={15}
              fill="#fff"
              fillOpacity={0.7}
              className="stroke-brand-600"
              strokeWidth={5}
            />
            <path
              d="M73 85 L86 98"
              className="stroke-brand-600"
              strokeWidth={6}
              strokeLinecap="round"
            />
          </g>

          <g clipPath={groundClip}>
            <Character idle="sway" delay={0.1} blink={5.2} lean={-4}>
              <path d={`M96 ${BURIED_Y} V100 a32 32 0 0 1 64 0 V${BURIED_Y}Z`} fill={SAND} />
              <g className="login-face">
                <Eye cx={116} cy={99} r={6.5} side={-1} />
                <Eye cx={140} cy={99} r={6.5} side={1} />
                <Mouth cx={128} cy={113} width={10} />
              </g>
            </Character>
          </g>

          <g transform="translate(172 50)">
            <g className="state-ask">
              <path
                d="M-5 -5 a5.5 5.5 0 1 1 7.5 5 c-2 0.9 -2.5 2 -2.5 4"
                fill="none"
                className="stroke-brand-400"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle cx={0} cy={9} r={1.9} className="fill-brand-400" />
            </g>
          </g>
        </>
      )}
    </StateSvg>
  )
}
