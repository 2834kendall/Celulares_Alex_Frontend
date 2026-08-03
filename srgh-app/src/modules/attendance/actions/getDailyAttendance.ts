'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { groupIntoDayJourney, type RawMark } from '@/modules/attendance/lib/marks'
import { diffMinutes, timeOfDay } from '@/modules/attendance/lib/time'
import { marcaTipoSchema } from '@/modules/attendance/types'

interface EmployeeJoin {
  emp_id: number
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
}

interface PositionJoin {
  pue_nombre: string | null
}

interface EmploymentHistoryRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
  sgrh_empleados: EmployeeJoin | null
  sgrh_cat_puestos: PositionJoin | null
}

interface AssignmentJoin {
  hor_hora_entrada: string
}

interface AssignmentRow {
  prg_historial_laboral_id: number
  prg_es_dia_libre: boolean
  prg_es_feriado: boolean
  prg_hora_entrada_custom: string | null
  sgrh_cat_horarios: AssignmentJoin | null
}

interface MarkDbRow {
  mar_id: number
  mar_historial_laboral_id: number
  mar_tipo: string
  mar_fecha_hora: string
}

export interface DailyMarkInfo {
  /** mar_id — lo necesita el modal de correccion para saber que fila actualizar. */
  id: number
  /** "HH:mm" */
  time: string
  /** Diferencia contra la hora esperada, en minutos. Positivo = tarde. null si no hay hora esperada con que comparar. Dato neutro: no clasifica tardanza. */
  diffMinutes: number | null
}

export interface DailyAttendanceRow {
  employmentHistoryId: number
  employeeId: number
  fullName: string
  position: string | null
  branchId: number
  isDayOff: boolean
  isHoliday: boolean
  /** "HH:mm", null si no hay programacion para este dia. */
  expectedStart: string | null
  entrada: DailyMarkInfo | null
  inicioAlmuerzo: DailyMarkInfo | null
  finAlmuerzo: DailyMarkInfo | null
  salida: DailyMarkInfo | null
  duplicateMarksCount: number
  isOpen: boolean
}

export type GetDailyAttendanceResult =
  { ok: true; date: string; data: DailyAttendanceRow[] } | { ok: false; error: string }

export async function getDailyAttendance(dateISO: string): Promise<GetDailyAttendanceResult> {
  const claims = await requirePermission(PERMISOS.ASISTENCIA_READ)
  const meta = claims.app_metadata as { empresa_id?: number; usr_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  // La sucursal del gerente NO viaja en el JWT (decision del equipo, SGRH-21):
  // se resuelve en vivo. null = sin sucursal fija asignada (ADMIN/RRHH),
  // que ven las marcas de toda la empresa — igual que get-sucursal-actual.ts.
  let sucursalId: number | null = null
  if (meta.usr_id) {
    const { data: asignacion } = await supabase
      .from('sgrh_usuarios_empresa_rol')
      .select('uer_sucursal_id')
      .eq('uer_usuario_id', meta.usr_id)
      .eq('uer_activo', true)
      .maybeSingle<{ uer_sucursal_id: number | null }>()
    sucursalId = asignacion?.uer_sucursal_id ?? null
  }

  let historialQuery = supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_empleado_id,
      lab_sucursal_id,
      sgrh_empleados ( emp_id, emp_nombre, emp_apellido_1, emp_apellido_2 ),
      sgrh_cat_puestos ( pue_nombre )
    `
    )
    .eq('lab_empresa_id', meta.empresa_id)
    .is('lab_fecha_fin', null)

  if (sucursalId !== null) {
    historialQuery = historialQuery.eq('lab_sucursal_id', sucursalId)
  }

  const { data: employmentHistory, error: errHistory } =
    await historialQuery.returns<EmploymentHistoryRow[]>()

  if (errHistory) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  if (employmentHistory.length === 0) {
    return { ok: true, date: dateISO, data: [] }
  }

  const historyIds = employmentHistory.map((h) => h.lab_id)

  const [{ data: assignments, error: errAssignments }, { data: marks, error: errMarks }] =
    await Promise.all([
      supabase
        .from('sgrh_programacion_semanal')
        .select(
          `
          prg_historial_laboral_id,
          prg_es_dia_libre,
          prg_es_feriado,
          prg_hora_entrada_custom,
          sgrh_cat_horarios ( hor_hora_entrada )
        `
        )
        .in('prg_historial_laboral_id', historyIds)
        .eq('prg_fecha', dateISO)
        .returns<AssignmentRow[]>(),
      supabase
        .from('sgrh_marcas_asistencia')
        .select('mar_id, mar_historial_laboral_id, mar_tipo, mar_fecha_hora')
        .in('mar_historial_laboral_id', historyIds)
        .gte('mar_fecha_hora', `${dateISO} 00:00:00`)
        .lte('mar_fecha_hora', `${dateISO} 23:59:59`)
        .returns<MarkDbRow[]>(),
    ])

  if (errAssignments) {
    return { ok: false, error: 'No se pudo cargar la programacion del dia.' }
  }

  if (errMarks) {
    return { ok: false, error: 'No se pudieron cargar las marcas del dia.' }
  }

  const assignmentByHistoryId = new Map<number, AssignmentRow>()
  for (const a of assignments ?? []) {
    assignmentByHistoryId.set(a.prg_historial_laboral_id, a)
  }

  const marksByHistoryId = new Map<number, RawMark[]>()
  for (const m of marks ?? []) {
    // mar_tipo es varchar sin enum en los tipos generados: se valida aca y se
    // descarta en silencio una fila que no calce (no deberia ocurrir con el
    // CHECK de la migracion aplicado, pero no debe tumbar todo el dashboard).
    const parsedTipo = marcaTipoSchema.safeParse(m.mar_tipo)
    if (!parsedTipo.success) continue

    const rawMark: RawMark = { id: m.mar_id, tipo: parsedTipo.data, fechaHora: m.mar_fecha_hora }
    const list = marksByHistoryId.get(m.mar_historial_laboral_id) ?? []
    list.push(rawMark)
    marksByHistoryId.set(m.mar_historial_laboral_id, list)
  }

  const data: DailyAttendanceRow[] = employmentHistory.map((h) => {
    const employee = h.sgrh_empleados
    const fullName = employee
      ? `${employee.emp_nombre} ${employee.emp_apellido_1}${employee.emp_apellido_2 ? ' ' + employee.emp_apellido_2 : ''}`
      : 'Sin nombre'

    const assignment = assignmentByHistoryId.get(h.lab_id)
    const expectedStart = assignment
      ? timeOfDay(
          assignment.prg_hora_entrada_custom ?? assignment.sgrh_cat_horarios?.hor_hora_entrada ?? ''
        )
      : null

    const journey = groupIntoDayJourney(marksByHistoryId.get(h.lab_id) ?? [])

    // La diferencia en minutos solo aplica a ENTRADA (RF-08, tardanza de
    // llegada). Salida/almuerzo no tienen una hora esperada propia cargada
    // aca — compararlas contra expectedStart (hora de ENTRADA del turno)
    // seria incorrecto, asi que quedan solo con su hora, sin diffMinutes.
    function markInfo(mark: RawMark | null, expected: string | null): DailyMarkInfo | null {
      if (!mark) return null
      const time = timeOfDay(mark.fechaHora)
      return {
        id: mark.id,
        time,
        diffMinutes: expected ? diffMinutes(time, expected) : null,
      }
    }

    return {
      employmentHistoryId: h.lab_id,
      employeeId: h.lab_empleado_id,
      fullName,
      position: h.sgrh_cat_puestos?.pue_nombre ?? null,
      branchId: h.lab_sucursal_id,
      isDayOff: assignment?.prg_es_dia_libre ?? false,
      isHoliday: assignment?.prg_es_feriado ?? false,
      expectedStart: expectedStart || null,
      entrada: markInfo(journey.entrada, expectedStart),
      inicioAlmuerzo: markInfo(journey.inicioAlmuerzo, null),
      finAlmuerzo: markInfo(journey.finAlmuerzo, null),
      salida: markInfo(journey.salida, null),
      duplicateMarksCount: journey.duplicates.length,
      isOpen: journey.isOpen,
    }
  })

  data.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))

  return { ok: true, date: dateISO, data }
}
