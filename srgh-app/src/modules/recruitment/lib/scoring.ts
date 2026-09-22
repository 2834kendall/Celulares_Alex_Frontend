/**
 * Puntaje ponderado de una postulación (SGRH-61).
 *
 * Evaluaciones de desempeño usa un promedio simple (`averageScore` en
 * evaluations/lib/scoring.ts) porque todos sus rubros valen igual. Acá no:
 * cada criterio de selección tiene `are_peso`, así que la experiencia puede
 * pesar el doble que los certificados.
 *
 * La escala y el redondeo se mantienen iguales a los de evaluaciones (0-10,
 * entero) para que `classifyScore` y `scoreColor` sigan sirviendo sin
 * traducción.
 */

export interface PuntajePonderable {
  /** 0-10. null cuando el criterio no aplica: queda fuera del cálculo. */
  puntaje: number | null
  /** are_peso del criterio. > 0. */
  peso: number
}

/**
 * Promedio ponderado redondeado a entero, o null si no quedó ningún
 * criterio aplicable.
 *
 * Con todos los pesos en 1 devuelve exactamente lo mismo que el promedio
 * simple — de ahí que agregar pesos no haya cambiado ningún puntaje ya
 * cargado (ver la migración 20260922000000).
 */
export function weightedAverageScore(items: PuntajePonderable[]): number | null {
  const aplicables = items.filter((item) => item.puntaje !== null && item.peso > 0)
  if (aplicables.length === 0) return null

  const pesoTotal = aplicables.reduce((total, item) => total + item.peso, 0)
  // Defensa: si todos los pesos fueran 0 no habría de qué dividir. El CHECK
  // de la tabla ya lo impide, pero el cálculo no depende de eso.
  if (pesoTotal <= 0) return null

  const suma = aplicables.reduce((total, item) => total + item.puntaje! * item.peso, 0)
  return Math.round(suma / pesoTotal)
}
