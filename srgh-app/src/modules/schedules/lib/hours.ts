/** Los primeros 10 minutos de break estan pagados; solo el exceso se resta de las horas trabajadas. */
export const PAID_BREAK_MINUTES = 10

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function subtractPeriod(minutes: number, start?: string | null, end?: string | null): number {
  if (!start || !end) return minutes
  return minutes - (toMinutes(end) - toMinutes(start))
}

function subtractBreakExcess(minutes: number, start?: string | null, end?: string | null): number {
  if (!start || !end) return minutes
  const breakMinutes = toMinutes(end) - toMinutes(start)
  const excess = Math.max(0, breakMinutes - PAID_BREAK_MINUTES)
  return minutes - excess
}

/**
 * Worked hours = full span minus lunch minus the break's excess over the
 * paid allowance. Both deductions are optional: pass null/undefined when a
 * period isn't set.
 */
export function hoursBetween(
  startTime: string,
  endTime: string,
  lunchStart?: string | null,
  lunchEnd?: string | null,
  breakStart?: string | null,
  breakEnd?: string | null
): number {
  let minutes = toMinutes(endTime) - toMinutes(startTime)
  minutes = subtractPeriod(minutes, lunchStart, lunchEnd)
  minutes = subtractBreakExcess(minutes, breakStart, breakEnd)
  return Math.max(0, minutes / 60)
}

/** "40" si es entero, "40.5" si no — mismo formato en toda la UI de horarios. */
export function formatHoursValue(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/** Campos de una plantilla que intervienen en las horas del dia. */
export interface TemplateTimes {
  hor_hora_entrada: string
  hor_hora_salida: string
  hor_hora_inicio_almuerzo?: string | null
  hor_hora_fin_almuerzo?: string | null
  hor_hora_inicio_break?: string | null
  hor_hora_fin_break?: string | null
  hor_hora_entrada_2?: string | null
  hor_hora_salida_2?: string | null
}

/** True si la plantilla es una jornada partida: trae un segundo bloque completo. */
export function hasSecondBlock(t: TemplateTimes): boolean {
  return Boolean(t.hor_hora_entrada_2 && t.hor_hora_salida_2)
}

/**
 * Horas de una plantilla. Con un solo bloque: entrada a salida menos almuerzo y
 * el exceso del break. Con segundo bloque (jornada partida): la suma de los dos
 * bloques; el hueco entre ambos no cuenta y no se descuenta ademas el almuerzo.
 */
export function templateHours(t: TemplateTimes): number {
  if (hasSecondBlock(t)) {
    return (
      hoursBetween(t.hor_hora_entrada, t.hor_hora_salida) +
      hoursBetween(t.hor_hora_entrada_2!, t.hor_hora_salida_2!)
    )
  }
  return hoursBetween(
    t.hor_hora_entrada,
    t.hor_hora_salida,
    t.hor_hora_inicio_almuerzo,
    t.hor_hora_fin_almuerzo,
    t.hor_hora_inicio_break,
    t.hor_hora_fin_break
  )
}
