'use client'

import { useId, type ReactNode, type RefObject } from 'react'

/** Que pantalla ilustra la escena (ver StateScene). */
export type StateKind = 'empty' | 'no-results' | 'not-found' | 'forbidden' | 'error'

/** Expresion de la figura: cada una tiene sus reglas en globals.css. */
export type StateMood = 'sleeping' | 'confused' | 'lost' | 'stern' | 'error'

/* Lienzo comun a todas las escenas de estado. Constante de modulo: useSceneGaze
   la usa como dependencia de su efecto. */
export const STATE_VIEW_BOX = { x: 0, y: 0, width: 240, height: 140 }
export const GROUND_Y = 124
/* Los cuerpos siguen por debajo del piso y la escena se recorta en el, como en
   el login: una figura que salta muestra mas cuerpo, nunca una base plana que
   se despega del suelo. */
export const BURIED_Y = GROUND_Y + 70

interface StateSvgProps {
  sceneRef: RefObject<SVGSVGElement | null>
  kind: StateKind
  mood: StateMood
  /** Recibe el `clip-path` del piso, para los cuerpos que se paran detras de el. */
  children: (groundClip: string) => ReactNode
}

/**
 * Lienzo de una escena de estado: el SVG con los ganchos del login
 * (`login-scene` trae parpadeo, reposo, toque, entrada y pausa fuera de
 * pantalla), el recorte del piso y la linea del piso, dibujada al final.
 *
 * Decorativo: oculto para los lectores de pantalla. Lo que la pantalla tiene
 * que decir va en su texto, no en el dibujo.
 */
export function StateSvg({ sceneRef, kind, mood, children }: StateSvgProps) {
  // Un id por instancia (puede haber dos escenas en pantalla). useId trae
  // caracteres que no conviene meter en un url(#…): quedan solo los seguros.
  const clipId = `state-ground-${useId().replace(/[^\w-]/g, '')}`

  return (
    <svg
      ref={sceneRef}
      viewBox={`${STATE_VIEW_BOX.x} ${STATE_VIEW_BOX.y} ${STATE_VIEW_BOX.width} ${STATE_VIEW_BOX.height}`}
      // overflow-visible: una figura tocada salta por encima del borde.
      className={`login-scene state-scene state-${kind} absolute inset-0 h-full w-full overflow-visible`}
      data-mood={mood}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={-100} y={-200} width={440} height={GROUND_Y + 200} />
        </clipPath>
      </defs>

      {children(`url(#${clipId})`)}

      <path
        d={`M12 ${GROUND_Y} H228`}
        className="stroke-brand-200"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  )
}
