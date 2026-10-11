/**
 * Orden de las columnas del tablero de selección (SGRH-96).
 *
 * Cada etapa activa del catálogo ES una columna. Ya no existe el nivel
 * intermedio de "fase" (Postulados / En evaluación / Decisión): el tablero
 * mostraba tres columnas fijas con las etapas adentro como etiqueta, y mover
 * a alguien de etapa muchas veces ni lo cambiaba de columna.
 *
 * La columna `eta_fase` sigue en la base y se usa SOLO como desempate
 * histórico: mientras nadie reordene las columnas, se respeta el orden que
 * tenían (fase y, dentro de ella, `eta_orden`), para que el tablero no
 * amanezca revuelto. La primera vez que alguien reordena, la acción
 * `reorderSelectionStages` renumera `eta_orden` y limpia `eta_fase`; de ahí
 * en adelante manda solo `eta_orden`. Las etapas nuevas nacen sin fase y van
 * al final. Así no hace falta ninguna migración.
 */

export interface StageOrderRow {
  eta_id: number
  eta_orden: number
  eta_fase: number | null
}

function compareStageRows(a: StageOrderRow, b: StageOrderRow): number {
  // Sin fase = después de todas las que todavía la tienen.
  const faseA = a.eta_fase ?? Number.MAX_SAFE_INTEGER
  const faseB = b.eta_fase ?? Number.MAX_SAFE_INTEGER
  return faseA - faseB || a.eta_orden - b.eta_orden || a.eta_id - b.eta_id
}

/** Filas del catálogo en el orden en que se muestran como columnas. */
export function sortStageRows<T extends StageOrderRow>(rows: T[]): T[] {
  return [...rows].sort(compareStageRows)
}

/** Columna ya ordenada: `orden` es su posición (0 = primera). */
export interface StagePosition {
  id: number
  orden: number
}

/** La columna que sigue a `current`, o la primera si todavía no tiene etapa. */
export function nextStage<T extends StagePosition>(
  stages: T[],
  current: StagePosition | null
): T | null {
  const ordered = [...stages].sort((a, b) => a.orden - b.orden)
  if (current === null) return ordered[0] ?? null
  const index = ordered.findIndex((stage) => stage.id === current.id)
  // La etapa actual ya no es una columna (se desactivó): no hay "siguiente"
  // que se pueda deducir, se ofrece la primera.
  if (index < 0) return ordered[0] ?? null
  return ordered[index + 1] ?? null
}
