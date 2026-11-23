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
  // `bloque` solo viene cuando faltó al segundo bloque de un día partido
  // (SGRH-110): vino al primero, y la fila tiene que decirlo.
  | (ItemBase & { kind: 'ausencia'; bloque?: 'segundo' })
  | (ItemBase & { kind: 'ausencia_justificada'; tipoNombre: string })

export interface JustificationQueue {
  /** Lo que el encargado todavia tiene que resolver. */
  pending: JustificationItem[]
  /** Lo ya justificado en el mes, para revisar o corregir el motivo. */
  resolved: JustificationItem[]
}

/** Dentro de un dia, como van pasando las marcas. */
const KIND_ORDER: Record<TardyDay['kind'], number> = { entrada: 0, almuerzo: 1, segundo_bloque: 2 }

function newestFirst(a: JustificationItem, b: JustificationItem) {
  // Lo de esta semana arriba; dentro del dia, por nombre, y las marcas de la
  // misma persona en el orden en que pasaron.
  return (
    b.date.localeCompare(a.date) ||
    a.employeeName.localeCompare(b.employeeName, 'es') ||
    (a.kind === 'tardia' && b.kind === 'tardia'
      ? KIND_ORDER[a.day.kind] - KIND_ORDER[b.day.kind]
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

    for (const date of row.absentSecondBlockDays) {
      pending.push({ ...base, kind: 'ausencia', date, bloque: 'segundo' })
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
