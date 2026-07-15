'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { rubroSchema, type RubroInput } from '@/modules/evaluations/types'

export type UpdateRubroResult = { ok: true } | { ok: false; error: string }

export async function updateRubro(
  areaId: number,
  criterioId: number | null,
  input: RubroInput
): Promise<UpdateRubroResult> {
  const parsed = rubroSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos del rubro invalidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error: areaError } = await supabase
    .from('sgrh_cat_areas_evaluacion')
    .update({ are_nombre: parsed.data.nombre })
    .eq('are_id', areaId)

  if (areaError) {
    return {
      ok: false,
      error: 'No se pudo actualizar el rubro. Verifique que el nombre no este repetido.',
    }
  }

  // Rubros antiguos pueden no tener criterio: se crea al editar.
  const { error: criterioError } = criterioId
    ? await supabase
        .from('sgrh_cat_criterios_evaluacion')
        .update({ cri_descripcion: parsed.data.descripcion })
        .eq('cri_id', criterioId)
    : await supabase
        .from('sgrh_cat_criterios_evaluacion')
        .insert({ cri_area_id: areaId, cri_descripcion: parsed.data.descripcion, cri_activo: true })

  if (criterioError) {
    return { ok: false, error: 'No se pudo actualizar la descripcion del rubro.' }
  }

  revalidatePath('/evaluations')
  return { ok: true }
}
