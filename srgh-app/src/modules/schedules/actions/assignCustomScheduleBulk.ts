'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  assignCustomScheduleBulkSchema,
  parseOptionalTime,
  type AssignCustomScheduleBulkInput,
} from '@/modules/schedules/types'
import { upsertDayAssignment } from '@/modules/schedules/lib/dayAssignment'

export type AssignCustomScheduleBulkResult = { ok: true } | { ok: false; error: string }

/** Aplica el mismo horario personalizado a todos los dias marcados en el modal, en una sola confirmacion. */
export async function assignCustomScheduleBulk(
  input: AssignCustomScheduleBulkInput
): Promise<AssignCustomScheduleBulkResult> {
  const parsed = assignCustomScheduleBulkSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de asignacion invalidos.' }
  }

  await requirePermission(PERMISOS.ASISTENCIA_WRITE)

  const data = parsed.data

  if (data.customEndTime <= data.customStartTime) {
    return { ok: false, error: 'La hora de salida debe ser posterior a la hora de entrada.' }
  }

  const customLunchStart = parseOptionalTime(data.customLunchStart)
  const customLunchEnd = parseOptionalTime(data.customLunchEnd)
  const customBreakStart = parseOptionalTime(data.customBreakStart)
  const customBreakEnd = parseOptionalTime(data.customBreakEnd)

  if (customLunchStart && customLunchEnd && customLunchEnd <= customLunchStart) {
    return { ok: false, error: 'El fin del almuerzo debe ser posterior al inicio.' }
  }

  if (customBreakStart && customBreakEnd && customBreakEnd <= customBreakStart) {
    return { ok: false, error: 'El fin del break debe ser posterior al inicio.' }
  }

  const supabase = await createClient()

  const results = await Promise.all(
    data.days.map(({ assignmentId, date }) =>
      upsertDayAssignment(supabase, assignmentId, {
        prg_empleado_id: data.employeeId,
        prg_sucursal_id: data.branchId,
        prg_historial_laboral_id: data.employmentHistoryId,
        prg_horario_id: null,
        prg_fecha: date,
        prg_es_dia_libre: false,
        prg_hora_entrada_custom: data.customStartTime,
        prg_hora_salida_custom: data.customEndTime,
        prg_hora_inicio_almuerzo_custom: customLunchStart,
        prg_hora_fin_almuerzo_custom: customLunchEnd,
        prg_hora_inicio_break_custom: customBreakStart,
        prg_hora_fin_break_custom: customBreakEnd,
      })
    )
  )

  const failed = results.find((r) => r.error)

  if (failed) {
    return { ok: false, error: 'No se pudo guardar la asignacion en todos los dias.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
