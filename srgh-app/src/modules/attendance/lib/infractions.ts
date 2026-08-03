import { diffMinutes } from '@/modules/attendance/lib/time'

export type DayAttendanceStatus = 'a_tiempo' | 'tardio' | 'ausente' | 'no_aplica'

export interface DayForInfraction {
  isDayOff: boolean
  isHoliday: boolean
  /** "HH:mm" esperado segun la programacion. null si no hay programacion ese dia. */
  expectedStart: string | null
  /** "HH:mm" de la marca de entrada. null si no marco. */
  entradaTime: string | null
  toleranciaMinutos: number
}

/**
 * Clasifica un dia para efectos de tardias/ausencias (RF-07/RF-08). Dia libre,
 * feriado, o sin programacion no cuentan ni a favor ni en contra ("no_aplica").
 */
export function classifyDay(day: DayForInfraction): DayAttendanceStatus {
  if (day.isDayOff || day.isHoliday || !day.expectedStart) {
    return 'no_aplica'
  }

  if (!day.entradaTime) {
    return 'ausente'
  }

  return diffMinutes(day.entradaTime, day.expectedStart) > day.toleranciaMinutos
    ? 'tardio'
    : 'a_tiempo'
}

export interface MonthlyInfractionSummary {
  tardias: number
  ausencias: number
}

export function summarizeMonth(days: DayForInfraction[]): MonthlyInfractionSummary {
  let tardias = 0
  let ausencias = 0

  for (const day of days) {
    const status = classifyDay(day)
    if (status === 'tardio') tardias++
    else if (status === 'ausente') ausencias++
  }

  return { tardias, ausencias }
}

/**
 * Regla temporal hardcodeada (decision del equipo, 2026-07-26): 3 tardias o
 * 1 ausencia en el mes disparan la advertencia. Pendiente de discutir si
 * pasa a ser configurable por el gerente (ver backlog de SGRH-21).
 */
const TARDIAS_LIMITE = 3
const AUSENCIAS_LIMITE = 1

export function shouldWarn(summary: MonthlyInfractionSummary): boolean {
  return summary.tardias >= TARDIAS_LIMITE || summary.ausencias >= AUSENCIAS_LIMITE
}
