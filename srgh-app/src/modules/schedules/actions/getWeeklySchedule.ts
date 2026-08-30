'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getWeekDates } from '@/modules/schedules/lib/week'
import { hoursBetween } from '@/modules/schedules/lib/hours'
import { signEmployeePhotos } from '@/lib/storage/employee-photos'

interface EmployeeJoin {
  emp_id: number
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
  emp_foto_path: string | null
}

interface PositionJoin {
  pue_nombre: string | null
}

interface BranchJoin {
  suc_id: number
  suc_nombre: string
}

interface EmploymentHistoryRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
  sgrh_empleados: EmployeeJoin | null
  sgrh_cat_puestos: PositionJoin | null
  sgrh_sucursales: BranchJoin | null
}

interface ScheduleJoin {
  hor_id: number
  hor_nombre: string
  hor_hora_entrada: string
  hor_hora_salida: string
  hor_hora_inicio_almuerzo: string
  hor_hora_fin_almuerzo: string
  hor_hora_inicio_break: string | null
  hor_hora_fin_break: string | null
}

interface AssignmentRow {
  prg_id: number
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_horario_id: number | null
  sgrh_cat_horarios: ScheduleJoin | null
  prg_hora_entrada_custom: string | null
  prg_hora_salida_custom: string | null
  prg_hora_inicio_almuerzo_custom: string | null
  prg_hora_fin_almuerzo_custom: string | null
  prg_hora_inicio_break_custom: string | null
  prg_hora_fin_break_custom: string | null
}

export interface DayAssignment {
  date: string
  assignmentId: number | null
  scheduleId: number | null
  scheduleName: string | null
  startTime: string | null
  endTime: string | null
  isDayOff: boolean
  hours: number
  customStartTime?: string | null
  customEndTime?: string | null
  customLunchStart?: string | null
  customLunchEnd?: string | null
  customBreakStart?: string | null
  customBreakEnd?: string | null
}

export interface EmployeeWeekRow {
  employmentHistoryId: number
  employeeId: number
  branchId: number
  branchName: string | null
  fullName: string
  /** URL firmada de la foto, o null si no tiene (el Avatar cae a iniciales). */
  fotoUrl: string | null
  position: string | null
  days: DayAssignment[]
  weeklyTotal: number
}

export type GetWeeklyScheduleResult =
  { ok: true; weekDates: string[]; data: EmployeeWeekRow[] } | { ok: false; error: string }

export async function getWeeklySchedule(weekStartISO: string): Promise<GetWeeklyScheduleResult> {
  // RLS policies on sgrh_programacion_semanal require ASISTENCIA_READ.
  const claims = await requirePermission(PERMISOS.ASISTENCIA_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const weekDates = getWeekDates(weekStartISO)
  const supabase = await createClient()

  const { data: employmentHistory, error: errHistory } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_empleado_id,
      lab_sucursal_id,
      sgrh_empleados ( emp_id, emp_nombre, emp_apellido_1, emp_apellido_2, emp_foto_path ),
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_id, suc_nombre )
    `
    )
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)
    .returns<EmploymentHistoryRow[]>()

  if (errHistory) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  const employmentHistoryIds = employmentHistory.map((h) => h.lab_id)

  const { data: assignments, error: errAssignments } = employmentHistoryIds.length
    ? await supabase
        .from('sgrh_programacion_semanal')
        .select(
          `
          prg_id,
          prg_historial_laboral_id,
          prg_fecha,
          prg_es_dia_libre,
          prg_horario_id,
          sgrh_cat_horarios ( hor_id, hor_nombre, hor_hora_entrada, hor_hora_salida, hor_hora_inicio_almuerzo, hor_hora_fin_almuerzo, hor_hora_inicio_break, hor_hora_fin_break ),
            prg_hora_entrada_custom,
            prg_hora_salida_custom,
            prg_hora_inicio_almuerzo_custom,
            prg_hora_fin_almuerzo_custom,
            prg_hora_inicio_break_custom,
            prg_hora_fin_break_custom

        `
        )
        .in('prg_historial_laboral_id', employmentHistoryIds)
        .gte('prg_fecha', weekDates[0])
        .lte('prg_fecha', weekDates[6])
        .returns<AssignmentRow[]>()
    : { data: [] as AssignmentRow[], error: null }

  if (errAssignments) {
    return { ok: false, error: 'No se pudo cargar la programacion semanal.' }
  }

  // Index by employmentHistoryId+date to avoid a linear find() per cell.
  const assignmentByCell = new Map<string, AssignmentRow>()
  for (const a of assignments ?? []) {
    assignmentByCell.set(`${a.prg_historial_laboral_id}|${a.prg_fecha}`, a)
  }

  // Una sola firma para toda la matriz (ver signEmployeePhotos).
  const fotoUrls = await signEmployeePhotos(
    employmentHistory.map((h) => h.sgrh_empleados?.emp_foto_path)
  )

  const data: EmployeeWeekRow[] = employmentHistory.map((h) => {
    const employee = h.sgrh_empleados
    const position = h.sgrh_cat_puestos
    const fullName = employee
      ? `${employee.emp_nombre} ${employee.emp_apellido_1}${employee.emp_apellido_2 ? ' ' + employee.emp_apellido_2 : ''}`
      : 'Sin nombre'

    let weeklyTotal = 0

    const days: DayAssignment[] = weekDates.map((date) => {
      const assignment = assignmentByCell.get(`${h.lab_id}|${date}`)

      if (!assignment) {
        return {
          date,
          assignmentId: null,
          scheduleId: null,
          scheduleName: null,
          startTime: null,
          endTime: null,
          isDayOff: false,
          hours: 0,
        }
      }

      const schedule = assignment.sgrh_cat_horarios
      const isCustom = Boolean(
        assignment.prg_hora_entrada_custom && assignment.prg_hora_salida_custom
      )
      let hours = 0

      if (!assignment.prg_es_dia_libre) {
        if (isCustom) {
          hours = hoursBetween(
            assignment.prg_hora_entrada_custom!,
            assignment.prg_hora_salida_custom!,
            assignment.prg_hora_inicio_almuerzo_custom,
            assignment.prg_hora_fin_almuerzo_custom,
            assignment.prg_hora_inicio_break_custom,
            assignment.prg_hora_fin_break_custom
          )
          weeklyTotal += hours
        } else if (schedule) {
          hours = hoursBetween(
            schedule.hor_hora_entrada,
            schedule.hor_hora_salida,
            schedule.hor_hora_inicio_almuerzo,
            schedule.hor_hora_fin_almuerzo,
            schedule.hor_hora_inicio_break,
            schedule.hor_hora_fin_break
          )
          weeklyTotal += hours
        }
      }

      return {
        date,
        assignmentId: assignment.prg_id,
        scheduleId: assignment.prg_horario_id,
        scheduleName: schedule?.hor_nombre ?? null,
        startTime: isCustom
          ? assignment.prg_hora_entrada_custom
          : (schedule?.hor_hora_entrada ?? null),
        endTime: isCustom ? assignment.prg_hora_salida_custom : (schedule?.hor_hora_salida ?? null),
        customStartTime: assignment.prg_hora_entrada_custom,
        customEndTime: assignment.prg_hora_salida_custom,
        customLunchStart: assignment.prg_hora_inicio_almuerzo_custom,
        customLunchEnd: assignment.prg_hora_fin_almuerzo_custom,
        customBreakStart: assignment.prg_hora_inicio_break_custom,
        customBreakEnd: assignment.prg_hora_fin_break_custom,
        isDayOff: assignment.prg_es_dia_libre,
        hours,
      }
    })

    return {
      employmentHistoryId: h.lab_id,
      employeeId: h.lab_empleado_id,
      branchId: h.lab_sucursal_id,
      branchName: h.sgrh_sucursales?.suc_nombre ?? null,
      fullName,
      // emp_foto_path nunca cruza al cliente: solo la URL firmada opaca.
      fotoUrl: employee?.emp_foto_path ? (fotoUrls[employee.emp_foto_path] ?? null) : null,
      position: position?.pue_nombre ?? null,
      days,
      weeklyTotal,
    }
  })

  return { ok: true, weekDates, data }
}
