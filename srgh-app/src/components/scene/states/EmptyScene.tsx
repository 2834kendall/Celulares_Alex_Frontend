'use client'

import { useRef, type ReactNode } from 'react'
import { Character, Eye, Mouth } from '@/components/scene/SceneParts'
import { useSceneGaze, type GazeActor, type GazeTarget } from '@/components/scene/useSceneGaze'
import { BURIED_Y, GROUND_Y, STATE_VIEW_BOX, StateSvg } from './StateSvg'

const ACTORS: readonly GazeActor[] = [{ anchor: [180, 104], stiffness: 80, damping: 9 }]

/* Dormido no sigue al puntero: la cabeza queda un poco gacha. */
const DOZING: GazeTarget = { direction: { x: 0.15, y: 0.4 } }

/* Las "z" que suben, cada una mas grande y mas arriba: [x, y, escala]. */
const ZZZ = [
  [200, 84, 1],
  [210, 70, 1.3],
  [222, 54, 1.6],
] as const

/**
 * Vacio: no hay nada todavia. Una caja abierta, con el icono de la pantalla
 * estampado al frente (`children`), y al lado una figura que dormita. Al
 * tocarla se despierta de un salto.
 */
export function EmptyScene({ children }: { children?: ReactNode }) {
  const sceneRef = useRef<SVGSVGElement>(null)

  useSceneGaze(sceneRef, STATE_VIEW_BOX, ACTORS, () => DOZING)

  return (
    <StateSvg sceneRef={sceneRef} kind="empty" mood="sleeping">
      {(groundClip) => (
        <>
          {/* Caja abierta: dos solapas y el frente. */}
          <path d="M42 84 L30 68 L64 68 L78 84Z" className="fill-brand-100" />
          <path d="M114 84 L126 68 L92 68 L78 84Z" className="fill-brand-200" />
          <rect
            x={42}
            y={84}
            width={72}
            height={GROUND_Y - 84}
            rx={6}
            fill="#fff"
            className="stroke-brand-200"
            strokeWidth={2}
          />
          {/* El icono de lucide trazado con currentColor: toma el color de aca. */}
          {children && (
            <g transform="translate(66 92)" className="text-brand-400">
              {children}
            </g>
          )}

          <g clipPath={groundClip}>
            <Character idle="stretch" delay={0.1} blink={5.6} lean={-2}>
              <path
                d={`M140 ${BURIED_Y} V${GROUND_Y} a40 40 0 0 1 80 0 V${BURIED_Y}Z`}
                className="fill-brand-300"
              />
              <g className="login-face">
                <Eye cx={168} cy={104} r={5.5} side={-1} />
                <Eye cx={192} cy={104} r={5.5} side={1} />
                <Mouth cx={180} cy={114} width={8} />
              </g>
            </Character>
          </g>

          {ZZZ.map(([x, y, scale], index) => (
            <g key={index} transform={`translate(${x} ${y}) scale(${scale})`}>
              <path
                className={`state-zzz state-zzz-${index + 1} stroke-brand-300`}
                d="M0 0 h6 l-6 7 h6"
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}
        </>
      )}
    </StateSvg>
  )
}
