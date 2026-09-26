'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteCriterioSeleccionResult = { ok: true } | { ok: false; error: string }

/**
 * Intenta el borrado definitivo (criterio + área). Si el criterio ya tiene
 * puntajes asociados (sgrh_postulacion_puntajes), la FK lo impide, así que
 * se desactiva para no perder el historial de postulaciones ya calificadas.
 * Mismo patrón que deleteRubro.ts en evaluations.
 */
export async function deleteCriterioSeleccion(
  areaId: number
): Promise<DeleteCriterioSeleccionResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error: criteriosError } = await supabase
    .from('sgrh_cat_criterios_seleccion')
    .delete()
    .eq('cri_area_id', areaId)

  if (!criteriosError) {
    const { error: areaError } = await supabase
      .from('sgrh_cat_areas_seleccion')
      .delete()
      .eq('are_id', areaId)

    if (!areaError) {
      revalidatePath('/recruitment')
      return { ok: true }
    }
  }

  const [{ error: offCriterios }, { error: offArea }] = await Promise.all([
    supabase
      .from('sgrh_cat_criterios_seleccion')
      .update({ cri_activo: false })
      .eq('cri_area_id', areaId),
    supabase.from('sgrh_cat_areas_seleccion').update({ are_activo: false }).eq('are_id', areaId),
  ])

  if (offCriterios || offArea) {
    return { ok: false, error: 'No se pudo eliminar el criterio.' }
  }

  revalidatePath('/recruitment')
  return { ok: true }
}
