'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { rubroSeleccionSchema, type RubroSeleccionInput } from '@/modules/recruitment/types'

export type CreateCriterioSeleccionResult = { ok: true; id: number } | { ok: false; error: string }

/**
 * Crea un nuevo rubro de selección (área + criterio). Mismo patrón que
 * createRubro.ts en evaluations — CATALOGOS_WRITE, no RECLUTAMIENTO_WRITE:
 * es el mismo permiso con el que ya se administran los rubros de
 * evaluación de desempeño.
 */
export async function createCriterioSeleccion(
  input: RubroSeleccionInput
): Promise<CreateCriterioSeleccionResult> {
  const parsed = rubroSeleccionSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos del criterio inválidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data: area, error: areaError } = await supabase
    .from('sgrh_cat_areas_seleccion')
    .insert({ are_nombre: parsed.data.nombre, are_tipo_aplicacion: 'ambos', are_activo: true })
    .select('are_id')
    .single()

  if (areaError) {
    return {
      ok: false,
      error: 'No se pudo crear el criterio. Verifique que el nombre no esté repetido.',
    }
  }

  const { error: criterioError } = await supabase.from('sgrh_cat_criterios_seleccion').insert({
    cri_area_id: area.are_id,
    cri_descripcion: parsed.data.descripcion,
    cri_activo: true,
  })

  if (criterioError) {
    // Sin la descripción el criterio no puede calificarse: se revierte el área.
    await supabase.from('sgrh_cat_areas_seleccion').delete().eq('are_id', area.are_id)
    return { ok: false, error: 'No se pudo guardar la descripción del criterio.' }
  }

  revalidatePath('/recruitment')
  return { ok: true, id: area.are_id }
}
