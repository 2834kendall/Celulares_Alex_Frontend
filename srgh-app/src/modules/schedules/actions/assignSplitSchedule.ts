'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { assignSplitScheduleSchema, type AssignSplitScheduleInput } from '@/modules/schedules/types'
import { describeAssignmentError, upsertDayAssignment } from '@/modules/schedules/lib/dayAssignment'
import { branchesBelongToEmpresa } from '@/modules/schedules/lib/validateBranches'

export type AssignSplitResult = { ok: true } | { ok: false; error: string }

/** Postgres devuelve las horas con segundos; las filas de programacion las guardan como HH:mm. */
const hhmm = (hora: string) => hora.slice(0, 5)

/**
 * SGRH-110: una plantilla partida con cada bloque en una sucursal distinta.
 *
 * Las sucursales las define la plantilla (hor_sucursal_id y hor_sucursal_id_2);
 * esta accion las lee de ahi y no del cliente. Un tramo es de una sola
 * sucursal, asi que el reparto se guarda como DOS tramos con horas propias, uno por bloque.
 *
 * Cada fila conserva prg_horario_id: las horas son propias (una por bloque),
 * pero el dia SI viene de una plantilla, y sin ese id la matriz lo mostraba
 * como "Personalizado", sin nombre ni color (QA, SGRH-115). Quien lee las
 * horas no se confunde: entrada y salida propias mandan sobre la plantilla
 * en toda la cadena (getWeeklySchedule, workingDay y nomina), asi que el id
 * solo aporta el nombre y el color.
 *
 * No es atomico: si el segundo bloque falla, el primero ya quedo guardado, y el
 * mensaje lo dice para que quien programa sepa en que estado quedo el dia.
 */
export async function assignSplitSchedule(
  input: AssignSplitScheduleInput
): Promise<AssignSplitResult> {
  const parsed = assignSplitScheduleSchema.safeParse(input)

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Datos de asignación inválidos.',
    }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const data = parsed.data
  const supabase = await createClient()

  const { data: schedule, error: scheduleError } = await supabase
    .from('sgrh_cat_horarios')
    .select(
      'hor_hora_entrada, hor_hora_salida, hor_hora_entrada_2, hor_hora_salida_2, hor_sucursal_id, hor_sucursal_id_2'
    )
    .eq('hor_id', data.scheduleId)
    .eq('hor_empresa_id', empresaId)
    .maybeSingle()

  if (scheduleError || !schedule) {
    return { ok: false, error: 'No se encontró el horario seleccionado.' }
  }

  if (!schedule.hor_hora_entrada_2 || !schedule.hor_hora_salida_2) {
    return { ok: false, error: 'El horario seleccionado no es una jornada partida.' }
  }

  const firstBranchId = schedule.hor_sucursal_id
  const secondBranchId = schedule.hor_sucursal_id_2

  if (!firstBranchId || !secondBranchId || firstBranchId === secondBranchId) {
    return {
      ok: false,
      error: 'El horario no reparte sus bloques entre sucursales distintas.',
    }
  }

  if (!(await branchesBelongToEmpresa(supabase, empresaId, [firstBranchId, secondBranchId]))) {
    return { ok: false, error: 'La sucursal seleccionada no es válida para tu empresa.' }
  }

  const bloque = (branchId: number, entrada: string, salida: string) => ({
    prg_empleado_id: data.employeeId,
    prg_sucursal_id: branchId,
    prg_historial_laboral_id: data.employmentHistoryId,
    prg_horario_id: data.scheduleId,
    prg_fecha: data.date,
    prg_es_dia_libre: false,
    prg_hora_entrada_custom: hhmm(entrada),
    prg_hora_salida_custom: hhmm(salida),
    prg_hora_inicio_almuerzo_custom: null,
    prg_hora_fin_almuerzo_custom: null,
    prg_hora_inicio_break_custom: null,
    prg_hora_fin_break_custom: null,
  })

  const first = await upsertDayAssignment(
    supabase,
    data.assignmentId,
    bloque(firstBranchId, schedule.hor_hora_entrada, schedule.hor_hora_salida)
  )

  if (first.error) {
    return {
      ok: false,
      error: describeAssignmentError(first.error, 'No se pudo guardar la asignación.'),
    }
  }

  const second = await upsertDayAssignment(
    supabase,
    null,
    bloque(secondBranchId, schedule.hor_hora_entrada_2, schedule.hor_hora_salida_2)
  )

  if (second.error) {
    revalidatePath('/schedule')
    return {
      ok: false,
      error: `Se guardó el primer bloque, pero no el segundo. ${describeAssignmentError(
        second.error,
        'No se pudo guardar la asignación.'
      )}`,
    }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
