'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  assignDayScheduleSchema,
  parseOptionalTime,
  type AssignDayInput,
} from '@/modules/schedules/types'
import { upsertDayAssignment } from '@/modules/schedules/lib/dayAssignment'

export type AssignDayResult = { ok: true } | { ok: false; error: string }

export async function assignDaySchedule(input: AssignDayInput): Promise<AssignDayResult> {
  const parsed = assignDayScheduleSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de asignacion invalidos.' }
  }

  // RLS policies on sgrh_programacion_semanal require ASISTENCIA_WRITE.
  await requirePermission(PERMISOS.ASISTENCIA_WRITE)

  const data = parsed.data
  const isCustom = Boolean(data.customStartTime && data.customEndTime)

  if (!data.isDayOff && !data.scheduleId && !isCustom) {
    return {
      ok: false,
      error:
        'Debe seleccionar un horario, definir uno personalizado, o marcar el dia como descanso.',
    }
  }

  if (isCustom && data.customEndTime! <= data.customStartTime!) {
    return { ok: false, error: 'La hora de salida debe ser posterior a la hora de entrada.' }
  }

  const customLunchStart = parseOptionalTime(data.customLunchStart)
  const customLunchEnd = parseOptionalTime(data.customLunchEnd)
  const customBreakStart = parseOptionalTime(data.customBreakStart)
  const customBreakEnd = parseOptionalTime(data.customBreakEnd)

  if (isCustom && customLunchStart && customLunchEnd && customLunchEnd <= customLunchStart) {
    return { ok: false, error: 'El fin del almuerzo debe ser posterior al inicio.' }
  }

  if (isCustom && customBreakStart && customBreakEnd && customBreakEnd <= customBreakStart) {
    return { ok: false, error: 'El fin del break debe ser posterior al inicio.' }
  }

  const supabase = await createClient()

  const payload = {
    prg_empleado_id: data.employeeId,
    prg_sucursal_id: data.branchId,
    prg_historial_laboral_id: data.employmentHistoryId,
    prg_horario_id: data.isDayOff || isCustom ? null : data.scheduleId,
    prg_fecha: data.date,
    prg_es_dia_libre: data.isDayOff,
    prg_hora_entrada_custom: isCustom ? (data.customStartTime ?? null) : null,
    prg_hora_salida_custom: isCustom ? (data.customEndTime ?? null) : null,
    prg_hora_inicio_almuerzo_custom: isCustom ? customLunchStart : null,
    prg_hora_fin_almuerzo_custom: isCustom ? customLunchEnd : null,
    prg_hora_inicio_break_custom: isCustom ? customBreakStart : null,
    prg_hora_fin_break_custom: isCustom ? customBreakEnd : null,
  }

  const { error } = await upsertDayAssignment(supabase, data.assignmentId, payload)

  if (error) {
    return { ok: false, error: 'No se pudo guardar la asignacion.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
