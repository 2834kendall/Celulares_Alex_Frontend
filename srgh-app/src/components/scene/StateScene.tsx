import type { ReactNode } from 'react'
import { BrokenScene } from '@/components/scene/states/BrokenScene'
import { EmptyScene } from '@/components/scene/states/EmptyScene'
import { GuardScene } from '@/components/scene/states/GuardScene'
import { LostScene } from '@/components/scene/states/LostScene'
import { NoResultsScene } from '@/components/scene/states/NoResultsScene'
import type { StateKind } from '@/components/scene/states/StateSvg'

export type { StateKind }

interface StateSceneProps {
  kind: StateKind
  /**
   * Solo `empty`: el icono de la pantalla, YA renderizado (ej. `<Clock />`).
   * Un componente de lucide es una funcion y no cruza de un Server Component
   * a uno de cliente; un elemento si.
   */
  children?: ReactNode
}

/**
 * Ilustracion de un estado de pantalla (vacio, sin resultados, 404, sin
 * acceso, error), con las figuras del login: parpadean, siguen al puntero y
 * saltan al tocarlas. Ocupa su contenedor (`absolute inset-0`): quien la usa
 * le da el tamaño con una caja `relative`.
 *
 * Cada escena corre su propia simulacion de la mirada: va una por pantalla,
 * no una por fila (los estados compactos, EmptyState `size="sm"`, no la usan).
 */
export function StateScene({ kind, children }: StateSceneProps) {
  switch (kind) {
    case 'empty':
      return <EmptyScene>{children}</EmptyScene>
    case 'no-results':
      return <NoResultsScene />
    case 'not-found':
      return <LostScene />
    case 'forbidden':
      return <GuardScene />
    case 'error':
      return <BrokenScene />
  }
}
