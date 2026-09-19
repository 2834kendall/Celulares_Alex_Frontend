import type { createClient } from '@/lib/supabase/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { timeOfDay } from '@/modules/attendance/lib/time'

/**
 * El cliente del usuario (paneles, con RLS) o el admin (el kiosco, que no
 * puede leer programacion: ver lib/kioskAccess.ts).
 */
type SupabaseServerClient =
  Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>

/**
 * Un dia visto desde la PROGRAMACION y no desde el contrato.
 *
 * La diferencia empieza a importar con SGRH-84: prg_sucursal_id es la
 * sucursal DEL DIA — el gerente puede trasladar a alguien celda por celda en
 * la matriz semanal — mientras que lab_sucursal_id es la del contrato y solo
 * cambia cuando RRHH edita el expediente. Hasta ese cambio las dos columnas
 * valian siempre lo mismo y daba igual cual se leyera; ahora no, y asistencia
 * tiene que mirar la primera: quien trabaja hoy en esta tienda es quien esta
 * programado aca hoy, no quien la tiene en su contrato.
 */
export interface DayAssignment {
  employmentHistoryId: number
  employeeId: number
  /** prg_sucursal_id: donde trabaja ESE dia. */
  branchId: number
  /** "HH:mm" de entrada esperada, null si la fila no define ninguna. */
  expectedStart: string | null
  /**
   * "HH:mm" del almuerzo y del receso programados, null si el turno no los
   * tiene. Salen del horario personalizado del dia cuando lo hay, y si no de
   * la plantilla — el mismo criterio con que la matriz semanal calcula las
   * horas (SGRH-88).
   */
  expectedLunchStart: string | null
  expectedLunchEnd: string | null
  expectedBreakStart: string | null
  expectedBreakEnd: string | null
  isDayOff: boolean
  isHoliday: boolean
}

interface DayAssignmentDbRow {
  prg_historial_laboral_id: number
  prg_empleado_id: number
  prg_sucursal_id: number
  prg_es_dia_libre: boolean
  prg_es_feriado: boolean
  prg_hora_entrada_custom: string | null
  prg_hora_salida_custom: string | null
  prg_hora_inicio_almuerzo_custom: string | null
  prg_hora_fin_almuerzo_custom: string | null
  prg_hora_inicio_break_custom: string | null
  prg_hora_fin_break_custom: string | null
  sgrh_cat_horarios: {
    hor_hora_entrada: string
    hor_hora_inicio_almuerzo: string | null
    hor_hora_fin_almuerzo: string | null
    hor_hora_inicio_break: string | null
    hor_hora_fin_break: string | null
  } | null
}

function hhmm(value: string | null | undefined): string | null {
  return value ? timeOfDay(value) : null
}

export type DayAssignmentsResult =
  { ok: true; data: DayAssignment[] } | { ok: false; error: string }

/**
 * Un dia programado habilita a marcar solo si de verdad se trabaja. Dia libre
 * y feriado tienen fila de programacion (por eso se ven en la matriz), pero
 * la tienda no abre: no hay nada que marcar. Si algun feriado se trabajara,
 * el gerente lo programa como dia normal — decision del cliente, 2026-09-17.
 */
export function isWorkable(day: DayAssignment): boolean {
  return !day.isDayOff && !day.isHoliday
}

function toDayAssignment(row: DayAssignmentDbRow): DayAssignment {
  const expectedRaw = row.prg_hora_entrada_custom ?? row.sgrh_cat_horarios?.hor_hora_entrada ?? ''

  // Un dia es "personalizado" cuando trae entrada Y salida propias, igual que
  // en getWeeklySchedule. En ese caso el almuerzo y el receso tambien son los
  // propios (pueden no existir); si no, los de la plantilla.
  const isCustom = Boolean(row.prg_hora_entrada_custom && row.prg_hora_salida_custom)
  const horario = row.sgrh_cat_horarios

  return {
    employmentHistoryId: row.prg_historial_laboral_id,
    employeeId: row.prg_empleado_id,
    branchId: row.prg_sucursal_id,
    expectedStart: expectedRaw ? timeOfDay(expectedRaw) : null,
    expectedLunchStart: hhmm(
      isCustom ? row.prg_hora_inicio_almuerzo_custom : horario?.hor_hora_inicio_almuerzo
    ),
    expectedLunchEnd: hhmm(
      isCustom ? row.prg_hora_fin_almuerzo_custom : horario?.hor_hora_fin_almuerzo
    ),
    expectedBreakStart: hhmm(
      isCustom ? row.prg_hora_inicio_break_custom : horario?.hor_hora_inicio_break
    ),
    expectedBreakEnd: hhmm(isCustom ? row.prg_hora_fin_break_custom : horario?.hor_hora_fin_break),
    isDayOff: row.prg_es_dia_libre,
    isHoliday: row.prg_es_feriado,
  }
}

async function queryDayAssignments(
  supabase: SupabaseServerClient,
  dateISO: string,
  sucursalIds: number[] | null,
  employeeId?: number
): Promise<DayAssignmentsResult> {
  let query = supabase
    .from('sgrh_programacion_semanal')
    .select(
      `
      prg_historial_laboral_id,
      prg_empleado_id,
      prg_sucursal_id,
      prg_es_dia_libre,
      prg_es_feriado,
      prg_hora_entrada_custom,
      prg_hora_salida_custom,
      prg_hora_inicio_almuerzo_custom,
      prg_hora_fin_almuerzo_custom,
      prg_hora_inicio_break_custom,
      prg_hora_fin_break_custom,
      sgrh_cat_horarios (
        hor_hora_entrada,
        hor_hora_inicio_almuerzo,
        hor_hora_fin_almuerzo,
        hor_hora_inicio_break,
        hor_hora_fin_break
      )
    `
    )
    .eq('prg_fecha', dateISO)

  // null = sin restriccion de sucursal (ADMIN/RRHH, o un usuario sin filas
  // activas): ven toda la empresa, igual que el resto del modulo.
  if (sucursalIds !== null) {
    query = query.in('prg_sucursal_id', sucursalIds)
  }

  if (employeeId !== undefined) {
    query = query.eq('prg_empleado_id', employeeId)
  }

  const { data, error } = await query.returns<DayAssignmentDbRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar la programacion del dia.' }
  }

  return { ok: true, data: (data ?? []).map(toDayAssignment) }
}

/**
 * Todas las filas de programacion de `dateISO` dentro del alcance de
 * sucursales dado, dia libre y feriado INCLUIDOS: el panel del gerente los
 * muestra como tales y los necesita. Quien deba decidir si se puede marcar
 * filtra despues con `isWorkable`.
 *
 * NO acota por empresa — sgrh_programacion_semanal no tiene columna de
 * empresa. El alcance por empresa lo pone quien llama al cruzar los
 * employmentHistoryId contra sgrh_historial_laboral, que es ademas donde se
 * comprueba que el contrato siga activo.
 */
export async function getDayAssignments(
  supabase: SupabaseServerClient,
  dateISO: string,
  sucursalIds: number[] | null
): Promise<DayAssignmentsResult> {
  return queryDayAssignments(supabase, dateISO, sucursalIds, undefined)
}

/**
 * La fila que habilita a ESTE empleado a marcar en ESTAS sucursales ESE dia,
 * o null si no la hay. Es la guarda del kiosco: sin programacion — o con el
 * dia marcado como libre o feriado — no se marca.
 *
 * Devuelve null tambien si la consulta falla. Para el llamador son el mismo
 * caso (no se puede acreditar que deba trabajar, no se marca) y distinguirlos
 * solo daria pie a tratar un error de red como permiso.
 */
export async function findWorkableDay(
  supabase: SupabaseServerClient,
  dateISO: string,
  employeeId: number,
  sucursalIds: number[] | null
): Promise<DayAssignment | null> {
  const result = await queryDayAssignments(supabase, dateISO, sucursalIds, employeeId)

  if (!result.ok) {
    return null
  }

  return result.data.find(isWorkable) ?? null
}
