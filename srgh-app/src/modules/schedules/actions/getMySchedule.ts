'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getWeekDates } from '@/modules/schedules/lib/week'
import { hoursBetween, templateHours } from '@/modules/schedules/lib/hours'
import { compareByStart } from '@/modules/schedules/lib/dayAssignment'
import type { SgrhJwtClaims } from '@/types/auth'
import { sucursalLabel } from '@/lib/empresa/marca-label'

interface ScheduleJoin {
  hor_id: number
  hor_nombre: string
  hor_color: string | null
  hor_hora_entrada: string
  hor_hora_salida: string
  hor_hora_inicio_almuerzo: string
  hor_hora_fin_almuerzo: string
  hor_hora_inicio_break: string | null
  hor_hora_fin_break: string | null
  hor_hora_entrada_2: string | null
  hor_hora_salida_2: string | null
}

interface BranchJoin {
  suc_nombre: string
  sgrh_marcas_comerciales?: { mco_nombre: string } | null
}

interface AssignmentRow {
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_es_feriado: boolean
  prg_observaciones: string | null
  prg_sucursal_id: number
  sgrh_sucursales: BranchJoin | null
  sgrh_cat_horarios: ScheduleJoin | null
  prg_hora_entrada_custom: string | null
  prg_hora_salida_custom: string | null
  prg_hora_inicio_almuerzo_custom: string | null
  prg_hora_fin_almuerzo_custom: string | null
  prg_hora_inicio_break_custom: string | null
  prg_hora_fin_break_custom: string | null
}

export interface MyDayAssignment {
  date: string
  isDayOff: boolean
  isHoliday: boolean
  scheduleId: number | null
  scheduleName: string | null
  // Color a medida de la plantilla, o null si usa el color por rotacion.
  scheduleColor: string | null
  isCustom: boolean
  startTime: string | null
  endTime: string | null
  /** Segundo bloque de una jornada partida (un tramo, una sucursal); null si no hay. */
  secondStartTime?: string | null
  secondEndTime?: string | null
  hours: number
  observaciones: string | null
  // Sucursal donde trabaja ese dia; null si no tiene asignacion.
  branchName: string | null
  /**
   * Los demas tramos del dia, cuando se trabaja en mas de una sucursal (SGRH-110):
   * por ejemplo 8-12 en una tienda y 13-17 en otra. Los campos de arriba describen
   * el PRIMER tramo (el que empieza antes); cada elemento de aca describe otro, con
   * la misma forma. Ausente cuando el dia tiene un solo tramo, que es lo normal.
   */
  extraTramos?: MyDayAssignment[]
}

export type GetMyScheduleResult =
  // weeklyTotal suma todos los tramos de cada dia.
  | { ok: true; weekDates: string[]; days: MyDayAssignment[]; weeklyTotal: number }
  | { ok: false; error: string }

/** Hora de inicio del tramo: la propia si trae entrada y salida, y si no la de la plantilla. */
function startOf(assignment: AssignmentRow): string | null {
  const isCustom = Boolean(assignment.prg_hora_entrada_custom && assignment.prg_hora_salida_custom)
  return isCustom
    ? assignment.prg_hora_entrada_custom
    : (assignment.sgrh_cat_horarios?.hor_hora_entrada ?? null)
}

/** Un tramo (una fila de programacion) con sus horas calculadas. */
function toMyDayAssignment(date: string, assignment: AssignmentRow): MyDayAssignment {
  const schedule = assignment.sgrh_cat_horarios
  const isCustom = Boolean(assignment.prg_hora_entrada_custom && assignment.prg_hora_salida_custom)
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
    } else if (schedule) {
      hours = templateHours(schedule)
    }
  }

  return {
    date,
    isDayOff: assignment.prg_es_dia_libre,
    isHoliday: assignment.prg_es_feriado,
    scheduleId: schedule?.hor_id ?? null,
    scheduleName: schedule?.hor_nombre ?? null,
    scheduleColor: schedule?.hor_color ?? null,
    isCustom,
    startTime: isCustom ? assignment.prg_hora_entrada_custom : (schedule?.hor_hora_entrada ?? null),
    endTime: isCustom ? assignment.prg_hora_salida_custom : (schedule?.hor_hora_salida ?? null),
    secondStartTime: isCustom ? null : (schedule?.hor_hora_entrada_2 ?? null),
    secondEndTime: isCustom ? null : (schedule?.hor_hora_salida_2 ?? null),
    hours,
    observaciones: assignment.prg_observaciones,
    branchName: sucursalLabel(assignment.sgrh_sucursales) ?? null,
  }
}

// Horario semanal filtrado al propio empleado (emp_id del JWT), no toda la sucursal.
export async function getMySchedule(weekStartISO: string): Promise<GetMyScheduleResult> {
  const claims = await requirePermission(PERMISOS.MI_HORARIO_READ)
  const meta = (claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const empId = meta.emp_id

  if (!empId) {
    return {
      ok: false,
      error: 'Tu cuenta todavía no está vinculada a un expediente de empleado.',
    }
  }

  const weekDates = getWeekDates(weekStartISO)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_programacion_semanal')
    .select(
      `
      prg_fecha,
      prg_es_dia_libre,
      prg_es_feriado,
      prg_observaciones,
      prg_sucursal_id,
      sgrh_sucursales ( suc_nombre, sgrh_marcas_comerciales ( mco_nombre ) ),
      sgrh_cat_horarios ( hor_id, hor_nombre, hor_color, hor_hora_entrada, hor_hora_salida, hor_hora_inicio_almuerzo, hor_hora_fin_almuerzo, hor_hora_inicio_break, hor_hora_fin_break, hor_hora_entrada_2, hor_hora_salida_2 ),
      prg_hora_entrada_custom,
      prg_hora_salida_custom,
      prg_hora_inicio_almuerzo_custom,
      prg_hora_fin_almuerzo_custom,
      prg_hora_inicio_break_custom,
      prg_hora_fin_break_custom
    `
    )
    .eq('prg_empleado_id', empId)
    .gte('prg_fecha', weekDates[0])
    .lte('prg_fecha', weekDates[6])
    .returns<AssignmentRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar tu horario.' }
  }

  // Un dia puede tener varios tramos (SGRH-110), uno por sucursal: se agrupan
  // por fecha y se ordenan por hora de inicio para que "el primero" sea estable.
  const byDate = new Map<string, AssignmentRow[]>()
  for (const a of data ?? []) {
    const list = byDate.get(a.prg_fecha)
    if (list) list.push(a)
    else byDate.set(a.prg_fecha, [a])
  }
  for (const list of byDate.values()) {
    if (list.length > 1) list.sort((a, b) => compareByStart(startOf(a), startOf(b)))
  }

  let weeklyTotal = 0

  const days: MyDayAssignment[] = weekDates.map((date) => {
    const list = byDate.get(date)

    if (!list) {
      return {
        date,
        isDayOff: false,
        isHoliday: false,
        scheduleId: null,
        scheduleName: null,
        scheduleColor: null,
        isCustom: false,
        startTime: null,
        endTime: null,
        hours: 0,
        observaciones: null,
        branchName: null,
      }
    }

    // Quien parte el dia en dos tiendas trabaja las horas de las dos.
    const tramos = list.map((assignment) => toMyDayAssignment(date, assignment))
    for (const tramo of tramos) weeklyTotal += tramo.hours

    const [primero, ...extras] = tramos
    return extras.length > 0 ? { ...primero, extraTramos: extras } : primero
  })

  return { ok: true, weekDates, days, weeklyTotal }
}
