'use client'

import { useEffect, useRef, useState } from 'react'
import { Character, Eye, Mouth } from '@/components/scene/SceneParts'
import { useSceneGaze, type GazeActor } from '@/components/scene/useSceneGaze'
import { STATE_VIEW_BOX, StateSvg } from './StateSvg'

const ACTORS: readonly GazeActor[] = [{ anchor: [120, 90], stiffness: 120, damping: 10 }]

/* Hacia donde mira, por turnos, buscando el camino. */
export const LOOK_AROUND = [
  { x: -0.9, y: -0.2 },
  { x: 0.85, y: -0.15 },
  { x: 0.3, y: 0.55 },
  { x: -0.5, y: 0.45 },
] as const

export const LOOK_STEP_MS = 1800

/* Un "4": palo, diagonal y travesano, en una caja de 40x60. */
const FOUR = 'M28 60 V0 L0 40 H40'

/**
 * 404: el "0" de un 4-0-4 es una figura perdida que mira para todos lados.
 * Lo hace por turnos con un temporizador (cada cambio de objetivo despierta
 * la simulacion de la mirada). Con movimiento reducido no recorre: la mirada
 * queda libre, como en las demas escenas.
 */
export function LostScene() {
  const sceneRef = useRef<SVGSVGElement>(null)
  const [step, setStep] = useState<number | null>(null)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(
      () => setStep((current) => ((current ?? -1) + 1) % LOOK_AROUND.length),
      LOOK_STEP_MS
    )
    return () => clearInterval(timer)
  }, [])

  useSceneGaze(sceneRef, STATE_VIEW_BOX, ACTORS, () =>
    step === null ? null : { direction: LOOK_AROUND[step] }
  )

  return (
    <StateSvg sceneRef={sceneRef} kind="not-found" mood="lost">
      {(groundClip) => (
        <>
          {[26, 174].map((x) => (
            <path
              key={x}
              d={FOUR}
              transform={`translate(${x} 62)`}
              fill="none"
              className="stroke-brand-300"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          <g clipPath={groundClip}>
            <Character idle="hop" delay={0.1} blink={4.6} lean={-3}>
              {/* Apoyado en el piso, no enterrado: un "0" que salta se despega
                  como una pelota. El recorte igual lo hace entrar desde atras. */}
              <ellipse cx={120} cy={94} rx={24} ry={30} className="fill-brand-600" />
              <g className="login-face">
                <Eye cx={111} cy={90} r={6.5} side={-1} />
                <Eye cx={129} cy={90} r={6.5} side={1} />
                <Mouth cx={120} cy={104} width={9} />
              </g>
            </Character>
          </g>
        </>
      )}
    </StateSvg>
  )
}
