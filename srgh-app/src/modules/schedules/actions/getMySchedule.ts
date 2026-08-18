'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getWeekDates } from '@/modules/schedules/lib/week'
import { hoursBetween } from '@/modules/schedules/lib/hours'
import type { SgrhJwtClaims } from '@/types/auth'

interface ScheduleJoin {
  hor_nombre: string
  hor_hora_entrada: string
  hor_hora_salida: string
  hor_hora_inicio_almuerzo: string
  hor_hora_fin_almuerzo: string
  hor_hora_inicio_break: string | null
  hor_hora_fin_break: string | null
}

interface AssignmentRow {
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_es_feriado: boolean
  prg_observaciones: string | null
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
  scheduleName: string | null
  startTime: string | null
  endTime: string | null
  hours: number
  observaciones: string | null
}

export type GetMyScheduleResult =
  | { ok: true; weekDates: string[]; days: MyDayAssignment[]; weeklyTotal: number }
  | { ok: false; error: string }

/**
 * El horario de la semana, pero SOLO el del propio empleado — a diferencia
 * de `getWeeklySchedule` (la matriz de gestion, que ve toda una sucursal),
 * esta consulta filtra explicitamente por `emp_id` del JWT ademas de confiar
 * en RLS: `sgrh_programacion_semanal` ya deja pasar las filas propias sin
 * ningun permiso (rama `prg_empleado_id = get_emp_id()`), y este filtro es
 * una segunda capa, no la unica.
 */
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
      sgrh_cat_horarios ( hor_nombre, hor_hora_entrada, hor_hora_salida, hor_hora_inicio_almuerzo, hor_hora_fin_almuerzo, hor_hora_inicio_break, hor_hora_fin_break ),
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

  const byDate = new Map((data ?? []).map((a) => [a.prg_fecha, a]))
  let weeklyTotal = 0

  const days: MyDayAssignment[] = weekDates.map((date) => {
    const assignment = byDate.get(date)

    if (!assignment) {
      return {
        date,
        isDayOff: false,
        isHoliday: false,
        scheduleName: null,
        startTime: null,
        endTime: null,
        hours: 0,
        observaciones: null,
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
      } else if (schedule) {
        hours = hoursBetween(
          schedule.hor_hora_entrada,
          schedule.hor_hora_salida,
          schedule.hor_hora_inicio_almuerzo,
          schedule.hor_hora_fin_almuerzo,
          schedule.hor_hora_inicio_break,
          schedule.hor_hora_fin_break
        )
      }
      weeklyTotal += hours
    }

    return {
      date,
      isDayOff: assignment.prg_es_dia_libre,
      isHoliday: assignment.prg_es_feriado,
      scheduleName: schedule?.hor_nombre ?? null,
      startTime: isCustom
        ? assignment.prg_hora_entrada_custom
        : (schedule?.hor_hora_entrada ?? null),
      endTime: isCustom ? assignment.prg_hora_salida_custom : (schedule?.hor_hora_salida ?? null),
      hours,
      observaciones: assignment.prg_observaciones,
    }
  })

  return { ok: true, weekDates, days, weeklyTotal }
}
