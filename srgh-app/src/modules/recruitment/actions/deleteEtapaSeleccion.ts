'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteEtapaSeleccionResult = { ok: true } | { ok: false; error: string }

/**
 * Elimina una columna del tablero.
 *
 * Primero se niega si todavía hay postulaciones en proceso paradas en ella:
 * al desaparecer la columna quedarían "sin etapa" y habría que rescatarlas
 * una por una. Es más claro pedir que se muevan antes.
 *
 * Después intenta el borrado definitivo. Si la etapa ya aparece en el
 * historial de alguna postulación (sgrh_postulacion_etapas), la FK lo impide
 * y se DESACTIVA: deja de ser una columna, pero el historial sigue mostrando
 * su nombre.
 */
export async function deleteEtapaSeleccion(etapaId: number): Promise<DeleteEtapaSeleccionResult> {
  if (!Number.isInteger(etapaId) || etapaId <= 0) {
    return { ok: false, error: 'Columna no encontrada.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()

  const { count, error: countError } = await supabase
    .from('sgrh_postulaciones')
    .select('pos_id', { count: 'exact', head: true })
    .eq('pos_etapa_actual_id', etapaId)
    .eq('pos_estado_final', 'en_proceso')

  if (countError) {
    return { ok: false, error: 'No se pudo eliminar la columna.' }
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        count === 1
          ? 'Hay 1 candidato en esta columna. Muévalo a otra antes de eliminarla.'
          : `Hay ${count} candidatos en esta columna. Muévalos a otra antes de eliminarla.`,
    }
  }

  const { error: deleteError } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .delete()
    .eq('eta_id', etapaId)

  if (!deleteError) {
    revalidatePath('/recruitment')
    revalidatePath('/settings/recruitment/stages')
    return { ok: true }
  }

  const { error: offError } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .update({ eta_activo: false })
    .eq('eta_id', etapaId)

  if (offError) {
    return { ok: false, error: 'No se pudo eliminar la columna.' }
  }

  revalidatePath('/recruitment')
  revalidatePath('/settings/recruitment/stages')
  return { ok: true }
}
