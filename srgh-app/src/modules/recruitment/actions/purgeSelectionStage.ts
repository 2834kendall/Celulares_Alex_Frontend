'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type PurgeSelectionStageResult = { ok: true } | { ok: false; error: string }

/**
 * Borra del todo una etapa DESACTIVADA. Solo es posible si ningún candidato
 * pasó por ella: el historial la referencia y la base lo impide (FK), que es
 * justamente lo que se quiere — el historial no se pierde por limpiar el
 * catálogo.
 *
 * No sirve para columnas del tablero: esas se eliminan desde su edición
 * (deleteEtapaSeleccion), que primero comprueba que no tengan candidatos.
 */
export async function purgeSelectionStage(stageId: number): Promise<PurgeSelectionStageResult> {
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return { ok: false, error: 'Etapa no encontrada.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .delete()
    .eq('eta_id', stageId)
    .eq('eta_activo', false)
    .select('eta_id')
    .returns<{ eta_id: number }[]>()

  if (error?.code === '23503') {
    return {
      ok: false,
      error:
        'No se puede eliminar del todo: hay candidatos que pasaron por esta etapa. Queda desactivada para conservar su historial.',
    }
  }
  if (error) {
    return { ok: false, error: 'No se pudo eliminar la etapa.' }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'Esa etapa ya no está desactivada. Recargue la página.' }
  }

  revalidatePath('/settings/recruitment/stages')
  return { ok: true }
}
