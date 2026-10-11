'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { registerStageEntry } from '@/modules/recruitment/lib/stageColumns'
import { moveToStageSchema, type MoveToStageInput } from '@/modules/recruitment/types'

export type MoveApplicationToStageResult = { ok: true } | { ok: false; error: string }

interface ApplicationRow {
  pos_candidato_id: number
  pos_estado_final: string
  pos_etapa_actual_id: number | null
}

/**
 * Mueve una postulación a otra columna del tablero (arrastrar la tarjeta, o
 * "Mover a" desde el menú o la ficha).
 *
 * El movimiento es LIBRE, hacia adelante o hacia atrás: en un tablero lo
 * natural es poder devolver una tarjeta que se soltó en la columna
 * equivocada. Cada movimiento queda en el historial con fecha y responsable,
 * así que devolver a alguien no borra nada. (Antes solo se podía avanzar y un
 * error no tenía arreglo.)
 *
 * No se pide resultado: ver moveToStageSchema.
 */
export async function moveApplicationToStage(
  input: MoveToStageInput
): Promise<MoveApplicationToStageResult> {
  const parsed = moveToStageSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del movimiento inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)
  const meta = claims.app_metadata as { usr_id?: number }
  const { applicationId, stageId, note } = parsed.data

  const supabase = await createClient()

  const [{ data: application }, { data: stage }] = await Promise.all([
    supabase
      .from('sgrh_postulaciones')
      .select('pos_candidato_id, pos_estado_final, pos_etapa_actual_id')
      .eq('pos_id', applicationId)
      .maybeSingle<ApplicationRow>(),
    supabase
      .from('sgrh_cat_etapas_seleccion')
      .select('eta_activo')
      .eq('eta_id', stageId)
      .maybeSingle<{ eta_activo: boolean }>(),
  ])

  if (!application) {
    return { ok: false, error: 'Postulación no encontrada.' }
  }
  if (application.pos_estado_final !== 'en_proceso') {
    return { ok: false, error: 'La postulación ya está cerrada.' }
  }
  if (!stage || !stage.eta_activo) {
    return { ok: false, error: 'Esa columna ya no existe. Recargue el tablero.' }
  }
  // Soltar la tarjeta en su misma columna no es un movimiento: no se ensucia
  // el historial con una fila que no dice nada.
  if (application.pos_etapa_actual_id === stageId) {
    return { ok: true }
  }

  const { error } = await registerStageEntry(supabase, {
    applicationId,
    stageId,
    note,
    userId: meta?.usr_id,
  })

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'No tienes permiso para mover esta postulación.' }
    }
    return { ok: false, error: 'No se pudo mover la postulación.' }
  }

  revalidatePath('/recruitment')
  revalidatePath(`/recruitment/candidates/${application.pos_candidato_id}`)
  return { ok: true }
}
