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
import {
  describeAssignmentError,
  upsertDayAssignment,
  type DayAssignmentPayload,
} from '@/modules/schedules/lib/dayAssignment'
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
    employee.days.flatMap((day) => [
      day.branchId,
      ...(day.extraTramos ?? []).map((tramo) => tramo.branchId),
    ])
  )

  if (!(await branchesBelongToEmpresa(supabase, empresaId, branchIds))) {
    return { ok: false, error: 'La sucursal seleccionada no es válida para tu empresa.' }
  }

  type Employee = (typeof parsed.data.employees)[number]
  type Tramo = Pick<
    Employee['days'][number],
    | 'branchId'
    | 'scheduleId'
    | 'customStartTime'
    | 'customEndTime'
    | 'customLunchStart'
    | 'customLunchEnd'
    | 'customBreakStart'
    | 'customBreakEnd'
  >

  function rowFor(
    employee: Employee,
    date: string,
    tramo: Tramo,
    isDayOff: boolean
  ): DayAssignmentPayload {
    const isCustom = Boolean(tramo.customStartTime && tramo.customEndTime)

    return {
      prg_empleado_id: employee.employeeId,
      prg_sucursal_id: tramo.branchId,
      prg_historial_laboral_id: employee.employmentHistoryId,
      prg_horario_id: isDayOff || isCustom ? null : tramo.scheduleId,
      prg_fecha: date,
      prg_es_dia_libre: isDayOff,
      prg_hora_entrada_custom: isCustom ? (tramo.customStartTime ?? null) : null,
      prg_hora_salida_custom: isCustom ? (tramo.customEndTime ?? null) : null,
      prg_hora_inicio_almuerzo_custom: isCustom ? parseOptionalTime(tramo.customLunchStart) : null,
      prg_hora_fin_almuerzo_custom: isCustom ? parseOptionalTime(tramo.customLunchEnd) : null,
      prg_hora_inicio_break_custom: isCustom ? parseOptionalTime(tramo.customBreakStart) : null,
      prg_hora_fin_break_custom: isCustom ? parseOptionalTime(tramo.customBreakEnd) : null,
    }
  }

  const allDays = parsed.data.employees.flatMap((employee) =>
    employee.days.map((day) => {
      const isCustom = Boolean(day.customStartTime && day.customEndTime)
      return { employee, day, isEmpty: day.scheduleId == null && !day.isDayOff && !isCustom }
    })
  )

  /*
   * Se escribe por fases (SGRH-110), porque el trigger de la base rechaza tramos
   * que se traslapan y un dia libre con otros tramos, y escribir todo a la vez
   * podria chocar contra filas que estan por reemplazarse:
   *   1. borrar lo que sobra: dias "sin asignar" en el origen y tramos
   *      adicionales viejos del destino;
   *   2. escribir el primer tramo de cada dia (en su fila, si ya tenia una);
   *   3. agregar los tramos adicionales como filas nuevas.
   * Cada fase espera a la anterior y, si falla, no se sigue con la siguiente.
   * Las escrituras son funciones (no se lanzan hasta que le toca su fase).
   */
  type Write = () => PromiseLike<{ error: { code?: string; message?: string } | null }>

  const deletions = allDays.flatMap(({ employee, day, isEmpty }) => {
    const removals: Write[] = []

    // Dia "sin asignar" en el origen: se replica quitando la asignacion existente, si hay.
    if (isEmpty && day.assignmentId) {
      const assignmentId = day.assignmentId
      removals.push(() =>
        supabase.from('sgrh_programacion_semanal').delete().eq('prg_id', assignmentId)
      )
    }

    // Solo filas de ese mismo contrato y dia: un id mal armado no borra otra cosa.
    for (const id of day.replaceTramoIds ?? []) {
      removals.push(() =>
        supabase
          .from('sgrh_programacion_semanal')
          .delete()
          .eq('prg_id', id)
          .eq('prg_historial_laboral_id', employee.employmentHistoryId)
          .eq('prg_fecha', day.date)
      )
    }

    return removals
  })

  const firstTramos: Write[] = allDays
    .filter(({ isEmpty }) => !isEmpty)
    .map(
      ({ employee, day }) =>
        () =>
          upsertDayAssignment(
            supabase,
            day.assignmentId,
            rowFor(employee, day.date, day, day.isDayOff)
          )
    )

  const extraTramos: Write[] = allDays.flatMap(({ employee, day }) =>
    (day.extraTramos ?? []).map(
      (tramo) => () => upsertDayAssignment(supabase, null, rowFor(employee, day.date, tramo, false))
    )
  )

  for (const phase of [deletions, firstTramos, extraTramos]) {
    const failed = (await Promise.all(phase.map((write) => write()))).find((result) => result.error)

    if (failed) {
      return {
        ok: false,
        error: describeAssignmentError(
          failed.error,
          'No se pudo aplicar el horario en todos los dias.'
        ),
      }
    }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
