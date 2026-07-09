'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type AssignDayInput = {
  prgId: number | null
  historialLaboralId: number
  empleadoId: number
  sucursalId: number
  fecha: string
  horarioId: number | null
  esDiaLibre: boolean
}

export type AssignDayResult = { ok: true } | { ok: false; error: string }

export async function assignDaySchedule(input: AssignDayInput): Promise<AssignDayResult> {
  await requirePermission(PERMISOS.HORARIOS_WRITE)

  if (!input.esDiaLibre && !input.horarioId) {
    return { ok: false, error: 'Debe seleccionar un horario o marcar el día como descanso.' }
  }

  const supabase = await createClient()

  const payload = {
    prg_empleado_id: input.empleadoId,
    prg_sucursal_id: input.sucursalId,
    prg_historial_laboral_id: input.historialLaboralId,
    prg_horario_id: input.esDiaLibre ? null : input.horarioId,
    prg_fecha: input.fecha,
    prg_es_dia_libre: input.esDiaLibre,
  }

  const { error } = input.prgId
    ? await supabase.from('sgrh_programacion_semanal').update(payload).eq('prg_id', input.prgId)
    : await supabase.from('sgrh_programacion_semanal').insert(payload)

  if (error) {
    return { ok: false, error: 'No se pudo guardar la asignación.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
