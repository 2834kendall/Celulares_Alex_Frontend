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

/**
 * Orden de los tramos de un mismo día: por hora de inicio, y sin hora (un día
 * libre, que no convive con otros tramos) primero. Con él, "el primer tramo"
 * del día es siempre el mismo sin importar en qué orden devuelva las filas la
 * base. Las horas llegan de Postgres como "HH:mm:ss", así que se comparan como
 * texto.
 */
export function compareByStart(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a < b ? -1 : 1
}

/**
 * El mensaje que ve quien programa cuando la base rechaza un tramo (SGRH-110).
 *
 * El trigger y el índice de sgrh_programacion_semanal rechazan lo que dejaría
 * un día incoherente; acá se traduce cada rechazo a algo que se pueda corregir.
 * Los mensajes del trigger ya vienen en español y dicen qué horas chocan, así
 * que se reusan tal cual — pero solo los suyos, no cualquier error de la base.
 */
export function describeAssignmentError(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string
): string {
  if (!error) return fallback

  // Índice sgrh_prg_tramo_unq: ya hay un tramo de este contrato en esa sucursal ese día.
  if (error.code === '23505') {
    return 'Este colaborador ya tiene un tramo en esa sucursal ese día. Edítalo en lugar de agregar otro.'
  }

  // Trigger sgrh_prg_validar_tramos: traslape (23P01) o día libre con otros tramos (23514).
  if (
    (error.code === '23P01' || error.code === '23514') &&
    /^(Los tramos del mismo día|Un día libre)/.test(error.message ?? '')
  ) {
    return error.message ?? fallback
  }

  return fallback
}

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
