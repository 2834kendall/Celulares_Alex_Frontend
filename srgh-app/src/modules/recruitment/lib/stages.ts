/**
 * Orden del embudo de selección: primero la columna del tablero (fase 1
 * Postulados → 2 En evaluación → 3 Decisión) y, dentro de cada columna, el
 * orden que se configura con las flechas en Configuración → Etapas.
 *
 * Es el mismo criterio para el selector de "Avanzar a", para la barra de
 * pasos de la ficha y para la validación del servidor (advanceStage), así
 * que "qué etapa viene después" no puede dar distinto en cada lugar.
 */

export interface StagePosition {
  fase: number
  orden: number
}

export function compareStages(a: StagePosition, b: StagePosition): number {
  return a.fase - b.fase || a.orden - b.orden
}

export function sortStages<T extends StagePosition>(stages: T[]): T[] {
  return [...stages].sort(compareStages)
}

/**
 * ¿Se puede pasar de `current` a `target`? Solo hacia adelante: RRHH decidió
 * que una postulación no vuelve a una etapa anterior. Sin etapa actual
 * (postulación recién creada) cualquier etapa es válida.
 */
export function isForward(current: StagePosition | null, target: StagePosition): boolean {
  return current === null || compareStages(target, current) > 0
}

/** Etapas a las que se puede avanzar desde `current`, en orden del embudo. */
export function stagesAfter<T extends StagePosition>(
  stages: T[],
  current: StagePosition | null
): T[] {
  return sortStages(stages).filter((stage) => isForward(current, stage))
}
