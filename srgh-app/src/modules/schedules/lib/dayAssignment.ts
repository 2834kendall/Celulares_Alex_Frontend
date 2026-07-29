import type { createClient } from '@/lib/supabase/server'

export interface DayAssignmentPayload {
  prg_empleado_id: number
  prg_sucursal_id: number
  prg_historial_laboral_id: number
  prg_horario_id: number | null
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_hora_entrada_custom: string | null
  prg_hora_salida_custom: string | null
  prg_hora_inicio_almuerzo_custom: string | null
  prg_hora_fin_almuerzo_custom: string | null
  prg_hora_inicio_break_custom: string | null
  prg_hora_fin_break_custom: string | null
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Upsert compartido por assignDaySchedule y assignCustomScheduleBulk: update si ya existe la celda, insert si no. */
export async function upsertDayAssignment(
  supabase: SupabaseServerClient,
  assignmentId: number | null,
  payload: DayAssignmentPayload
) {
  return assignmentId
    ? supabase.from('sgrh_programacion_semanal').update(payload).eq('prg_id', assignmentId)
    : supabase.from('sgrh_programacion_semanal').insert(payload)
}
