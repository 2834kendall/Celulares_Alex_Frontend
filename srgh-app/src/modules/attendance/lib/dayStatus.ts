import type { DailyAttendanceRow } from '@/modules/attendance/actions/getDailyAttendance'
import { classifyTardiness, type TardinessType } from '@/modules/attendance/lib/infractions'
import { diffMinutes } from '@/modules/attendance/lib/time'

/**
 * Estado de UNA persona en UN día, con las mismas palabras que la tarjeta
 * «Asistencia de hoy» del dashboard (SGRH-120). Lo usan el dashboard y el
 * Diario: si cada uno lo calculara por su lado, los números no coincidirían.
 *
 *  - `libre`: día libre o feriado.
 *  - `sin_programacion`: no tenía turno, ni ausencia, ni marcó.
 *  - `justificada`: la cubre una ausencia aprobada.
 *  - `por_llegar`: no marcó, pero todavía está dentro de su tolerancia.
 *  - `sin_marcar`: no marcó y ya pasó el minuto de la primera tardía.
 *  - `en_jornada`: marcó entrada y no salida (hoy).
 *  - `sin_salida`: marcó entrada y no salida, en un día que ya terminó.
 *  - `ya_salio`: marcó entrada y salida.
 */
export type DayStatusKind =
  | 'libre'
  | 'sin_programacion'
  | 'justificada'
  | 'por_llegar'
  | 'sin_marcar'
  | 'en_jornada'
  | 'sin_salida'
  | 'ya_salio'

export interface DayStatus {
  kind: DayStatusKind
  /**
   * Tardía de la entrada, si marcó tarde (la que ya clasificó Asistencia).
   * Para `sin_marcar`, la tardía en la que caería si llegara ahora.
   */
  tardiness: { nombre: string; color: string | null; minutes: number; isJustified: boolean } | null
  /** Si el encargado tiene que hacer algo con esta persona. */
  needsAttention: boolean
}

/**
 * Cuándo se mira el día:
 *  - `today`: la hora actual de Costa Rica, "HH:mm".
 *  - `past`: el día ya terminó; quien no marcó, faltó, y quien no marcó
 *    salida, la olvidó.
 *  - `future`: todavía no empieza; nadie falta.
 */
export type DayClock = { when: 'today'; nowTime: string } | { when: 'past' } | { when: 'future' }

/** Lo que el dashboard y el Diario comparten: cómo está cada persona. */
export function attendanceStatusOf(
  row: Omit<DailyAttendanceRow, 'status'>,
  clock: DayClock,
  tipos: TardinessType[]
): DayStatus {
  if (row.isDayOff || row.isHoliday) return none('libre')
  if (!row.expectedStart && !row.ausencia && !row.entrada) return none('sin_programacion')

  if (row.entrada) {
    const tardiness = row.tardiness
      ? {
          nombre: row.tardiness.tipo.nombre,
          color: row.tardiness.tipo.color,
          minutes: row.tardiness.diffMinutes,
          isJustified: row.tardiness.isJustified,
        }
      : null
    const lateUnjustified = tardiness !== null && !tardiness.isJustified

    if (row.salida) return { kind: 'ya_salio', tardiness, needsAttention: lateUnjustified }
    if (clock.when === 'past') return { kind: 'sin_salida', tardiness, needsAttention: true }
    return { kind: 'en_jornada', tardiness, needsAttention: lateUnjustified }
  }

  if (row.ausencia || !row.expectedStart) return none('justificada')
  if (clock.when === 'future') return none('por_llegar')

  if (clock.when === 'past') {
    return { kind: 'sin_marcar', tardiness: null, needsAttention: true }
  }

  const minutes = diffMinutes(clock.nowTime, row.expectedStart)
  const tipo = classifyTardiness(minutes, tipos)
  if (!tipo) return none('por_llegar')

  return {
    kind: 'sin_marcar',
    tardiness: { nombre: tipo.nombre, color: tipo.color, minutes, isJustified: false },
    needsAttention: true,
  }
}

function none(kind: DayStatusKind): DayStatus {
  return { kind, tardiness: null, needsAttention: false }
}
