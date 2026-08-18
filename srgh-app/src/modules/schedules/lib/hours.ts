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
