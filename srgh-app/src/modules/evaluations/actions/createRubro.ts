'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { rubroSchema, type RubroInput } from '@/modules/evaluations/types'

export type CreateRubroResult = { ok: true; id: number } | { ok: false; error: string }

export async function createRubro(input: RubroInput): Promise<CreateRubroResult> {
  const parsed = rubroSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos del rubro invalidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data: area, error: areaError } = await supabase
    .from('sgrh_cat_areas_evaluacion')
    .insert({ are_nombre: parsed.data.nombre, are_tipo_aplicacion: 'ambos', are_activo: true })
    .select('are_id')
    .single()

  if (areaError) {
    return {
      ok: false,
      error: 'No se pudo crear el rubro. Verifique que el nombre no este repetido.',
    }
  }

  const { error: criterioError } = await supabase.from('sgrh_cat_criterios_evaluacion').insert({
    cri_area_id: area.are_id,
    cri_descripcion: parsed.data.descripcion,
    cri_activo: true,
  })

  if (criterioError) {
    // Sin el criterio el rubro no puede calificarse: se revierte el area.
    await supabase.from('sgrh_cat_areas_evaluacion').delete().eq('are_id', area.are_id)
    return { ok: false, error: 'No se pudo guardar la descripcion del rubro.' }
  }

  revalidatePath('/evaluations')
  return { ok: true, id: area.are_id }
}
