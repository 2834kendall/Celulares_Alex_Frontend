import type { AusenciaWeekRow } from '@/modules/absences/actions/getAusenciasForWeek'

export interface AusenciaOverlayEntry {
  employmentHistoryId: number
  date: string
  tipoNombre: string
  isIntraday: boolean
}

/**
 * Expande cada ausencia (rango fechaInicio..fechaFin) en una entrada por
 * cada dia de la semana visible que cubre, para superponerla sobre la
 * matriz de horarios sin acoplar el modulo de horarios a las tablas de
 * ausencias. Las fechas ISO (YYYY-MM-DD) comparan correctamente como texto.
 */
export function buildAusenciaOverlayEntries(
  ausencias: AusenciaWeekRow[],
  weekDates: string[]
): AusenciaOverlayEntry[] {
  const entries: AusenciaOverlayEntry[] = []

  for (const ausencia of ausencias) {
    for (const date of weekDates) {
      if (date >= ausencia.fechaInicio && date <= ausencia.fechaFin) {
        entries.push({
          employmentHistoryId: ausencia.employmentHistoryId,
          date,
          tipoNombre: ausencia.tipoNombre,
          isIntraday: ausencia.esIntradia,
        })
      }
    }
  }

  return entries
}
