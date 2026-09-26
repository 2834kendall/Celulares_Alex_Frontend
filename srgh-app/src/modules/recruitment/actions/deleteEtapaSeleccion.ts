'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteEtapaSeleccionResult = { ok: true } | { ok: false; error: string }

/**
 * Intenta el borrado definitivo. Si la etapa ya aparece en el historial de
 * alguna postulación (sgrh_postulacion_etapas) o es la etapa actual de
 * alguna (sgrh_postulaciones.pos_etapa_actual_id), la FK lo impide y se
 * DESACTIVA: sale del selector de avance pero el historial sigue mostrando
 * su nombre. Mismo criterio que deleteRubro/deleteCriterioSeleccion.
 */
export async function deleteEtapaSeleccion(etapaId: number): Promise<DeleteEtapaSeleccionResult> {
  if (!Number.isInteger(etapaId) || etapaId <= 0) {
    return { ok: false, error: 'Etapa no encontrada.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()

  const { error: deleteError } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .delete()
    .eq('eta_id', etapaId)

  if (!deleteError) {
    revalidatePath('/settings')
    revalidatePath('/recruitment')
    return { ok: true }
  }

  const { error: offError } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .update({ eta_activo: false })
    .eq('eta_id', etapaId)

  if (offError) {
    return { ok: false, error: 'No se pudo eliminar la etapa.' }
  }

  revalidatePath('/settings')
  revalidatePath('/recruitment')
  return { ok: true }
}
