'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  pasteWeeklyScheduleSchema,
  parseOptionalTime,
  type PasteWeeklyScheduleInput,
} from '@/modules/schedules/types'
import { upsertDayAssignment } from '@/modules/schedules/lib/dayAssignment'
import { branchesBelongToEmpresa } from '@/modules/schedules/lib/validateBranches'

export type PasteWeeklyScheduleResult = { ok: true } | { ok: false; error: string }

/**
 * Escribe varios dias de varios colaboradores en una sola confirmacion —
 * usado por "Pegar horario" (lo copiado de otra semana) y por "Generar
 * sugerido" (lo calculado a partir del historial), que comparten la misma
 * forma de escritura dia por dia que ya usa assignDaySchedule.
 */
export async function pasteWeeklySchedule(
  input: PasteWeeklyScheduleInput
): Promise<PasteWeeklyScheduleResult> {
  const parsed = pasteWeeklyScheduleSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos invalidos.' }
  }

  // RLS policies on sgrh_programacion_semanal require ASISTENCIA_WRITE.
  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const branchIds = parsed.data.employees.flatMap((employee) =>
    employee.days.map((day) => day.branchId)
  )

  if (!(await branchesBelongToEmpresa(supabase, empresaId, branchIds))) {
    return { ok: false, error: 'La sucursal seleccionada no es válida para tu empresa.' }
  }

  const writes = parsed.data.employees.flatMap((employee) =>
    employee.days.map((day) => {
      const isCustom = Boolean(day.customStartTime && day.customEndTime)
      const isEmpty = day.scheduleId == null && !day.isDayOff && !isCustom

      // Dia "sin asignar" en el origen: se replica quitando la asignacion existente, si hay.
      if (isEmpty) {
        return day.assignmentId
          ? supabase.from('sgrh_programacion_semanal').delete().eq('prg_id', day.assignmentId)
          : Promise.resolve({ error: null })
      }

      return upsertDayAssignment(supabase, day.assignmentId, {
        prg_empleado_id: employee.employeeId,
        prg_sucursal_id: day.branchId,
        prg_historial_laboral_id: employee.employmentHistoryId,
        prg_horario_id: day.isDayOff || isCustom ? null : day.scheduleId,
        prg_fecha: day.date,
        prg_es_dia_libre: day.isDayOff,
        prg_hora_entrada_custom: isCustom ? (day.customStartTime ?? null) : null,
        prg_hora_salida_custom: isCustom ? (day.customEndTime ?? null) : null,
        prg_hora_inicio_almuerzo_custom: isCustom ? parseOptionalTime(day.customLunchStart) : null,
        prg_hora_fin_almuerzo_custom: isCustom ? parseOptionalTime(day.customLunchEnd) : null,
        prg_hora_inicio_break_custom: isCustom ? parseOptionalTime(day.customBreakStart) : null,
        prg_hora_fin_break_custom: isCustom ? parseOptionalTime(day.customBreakEnd) : null,
      })
    })
  )

  const results = await Promise.all(writes)
  const failed = results.some((r) => r.error)

  if (failed) {
    return { ok: false, error: 'No se pudo aplicar el horario en todos los dias.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
