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

/**
 * Ausencias que lista el panel cuando hay una marca elegida. Solo el panel: la matriz
 * las recibe todas, porque de ellas depende el bloqueo de cada celda.
 *
 * Con matriz, las de quienes salen en ella (turnos prestados incluidos). Quien lee
 * ausencias sin poder leer la matriz no tiene esas filas: va la sucursal del contrato.
 */
export function ausenciasDelPanel(
  ausencias: AusenciaWeekRow[],
  sucursalIds: number[] | null,
  contratosDeLaMatriz: number[] | null
): AusenciaWeekRow[] {
  if (!sucursalIds) return ausencias
  return ausencias.filter((ausencia) =>
    contratosDeLaMatriz
      ? contratosDeLaMatriz.includes(ausencia.employmentHistoryId)
      : ausencia.sucursalContratoId !== null && sucursalIds.includes(ausencia.sucursalContratoId)
  )
}
