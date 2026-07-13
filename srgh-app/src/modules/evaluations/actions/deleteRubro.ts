'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteRubroResult = { ok: true } | { ok: false; error: string }

/**
 * Intenta el borrado definitivo del rubro (criterios + area). Si el rubro ya
 * tiene evaluaciones asociadas la FK lo impide, asi que se desactiva para que
 * deje de aparecer sin perder el historial.
 */
export async function deleteRubro(areaId: number): Promise<DeleteRubroResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error: criteriosError } = await supabase
    .from('sgrh_cat_criterios_evaluacion')
    .delete()
    .eq('cri_area_id', areaId)

  if (!criteriosError) {
    const { error: areaError } = await supabase
      .from('sgrh_cat_areas_evaluacion')
      .delete()
      .eq('are_id', areaId)

    if (!areaError) {
      revalidatePath('/evaluations')
      return { ok: true }
    }
  }

  const [{ error: offCriterios }, { error: offArea }] = await Promise.all([
    supabase
      .from('sgrh_cat_criterios_evaluacion')
      .update({ cri_activo: false })
      .eq('cri_area_id', areaId),
    supabase.from('sgrh_cat_areas_evaluacion').update({ are_activo: false }).eq('are_id', areaId),
  ])

  if (offCriterios || offArea) {
    return { ok: false, error: 'No se pudo eliminar el rubro.' }
  }

  revalidatePath('/evaluations')
  return { ok: true }
}
