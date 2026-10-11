'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { rubroSeleccionSchema, type RubroSeleccionInput } from '@/modules/recruitment/types'

export type UpdateCriterioSeleccionResult = { ok: true } | { ok: false; error: string }

export async function updateCriterioSeleccion(
  areaId: number,
  criterioId: number | null,
  input: RubroSeleccionInput
): Promise<UpdateCriterioSeleccionResult> {
  const parsed = rubroSeleccionSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos del criterio inválidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error: areaError } = await supabase
    .from('sgrh_cat_areas_seleccion')
    .update({
      are_nombre: parsed.data.nombre,
      are_color: parsed.data.color,
      are_peso: parsed.data.peso,
    })
    .eq('are_id', areaId)

  if (areaError) {
    return {
      ok: false,
      error: 'No se pudo actualizar el criterio. Verifique que el nombre no esté repetido.',
    }
  }

  const { error: criterioError } = criterioId
    ? await supabase
        .from('sgrh_cat_criterios_seleccion')
        .update({ cri_descripcion: parsed.data.descripcion })
        .eq('cri_id', criterioId)
    : await supabase
        .from('sgrh_cat_criterios_seleccion')
        .insert({ cri_area_id: areaId, cri_descripcion: parsed.data.descripcion, cri_activo: true })

  if (criterioError) {
    return { ok: false, error: 'No se pudo actualizar la descripción del criterio.' }
  }

  revalidatePath('/recruitment')
  return { ok: true }
}
