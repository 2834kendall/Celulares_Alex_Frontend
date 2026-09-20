import type {
  MonthlyEmployeeSummary,
  TardyDay,
} from '@/modules/attendance/actions/getMonthlyAttendanceSummary'

interface ItemBase {
  employmentHistoryId: number
  employeeName: string
  date: string
}

/**
 * Un renglon de la bandeja "Por justificar": una tardia (de entrada o al
 * volver del almuerzo) o un dia de ausencia, de cualquier colaborador.
 */
export type JustificationItem =
  | (ItemBase & { kind: 'tardia'; day: TardyDay })
  | (ItemBase & { kind: 'ausencia' })
  | (ItemBase & { kind: 'ausencia_justificada'; tipoNombre: string })

export interface JustificationQueue {
  /** Lo que el encargado todavia tiene que resolver. */
  pending: JustificationItem[]
  /** Lo ya justificado en el mes, para revisar o corregir el motivo. */
  resolved: JustificationItem[]
}

function newestFirst(a: JustificationItem, b: JustificationItem) {
  // Lo de esta semana arriba; dentro del dia, por nombre, y la entrada antes
  // que el almuerzo de la misma persona.
  return (
    b.date.localeCompare(a.date) ||
    a.employeeName.localeCompare(b.employeeName, 'es') ||
    (a.kind === 'tardia' && b.kind === 'tardia'
      ? a.day.kind === b.day.kind
        ? 0
        : a.day.kind === 'entrada'
          ? -1
          : 1
      : 0)
  )
}

/**
 * Arma la bandeja a partir del resumen del mes: no hace falta otra consulta,
 * el resumen ya trae cada tardia y cada ausencia con lo necesario para
 * justificarla.
 *
 * Una tardia sin marca detras (markId null) no entra: no habria que
 * justificar. En la practica la clasificacion no produce ese caso.
 */
export function buildJustificationQueue(rows: MonthlyEmployeeSummary[]): JustificationQueue {
  const pending: JustificationItem[] = []
  const resolved: JustificationItem[] = []

  for (const row of rows) {
    const base = { employmentHistoryId: row.employmentHistoryId, employeeName: row.fullName }

    for (const day of row.tardyDays) {
      if (day.markId === null) continue
      const item: JustificationItem = { ...base, kind: 'tardia', date: day.date, day }
      if (day.isJustified) resolved.push(item)
      else pending.push(item)
    }

    for (const date of row.absentDays) {
      pending.push({ ...base, kind: 'ausencia', date })
    }

    for (const absence of row.justifiedAbsences) {
      resolved.push({
        ...base,
        kind: 'ausencia_justificada',
        date: absence.date,
        tipoNombre: absence.tipoNombre,
      })
    }
  }

  return { pending: pending.sort(newestFirst), resolved: resolved.sort(newestFirst) }
}
