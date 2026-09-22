'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { RubroSeleccionRow } from '@/modules/recruitment/types'

interface CriterioJoin {
  cri_id: number
  cri_descripcion: string
  cri_activo: boolean
}

interface AreaRow {
  are_id: number
  are_nombre: string
  are_activo: boolean
  sgrh_cat_criterios_seleccion: CriterioJoin[]
}

export type GetRubrosSeleccionResult =
  { ok: true; data: RubroSeleccionRow[] } | { ok: false; error: string }

/**
 * Rubros del catálogo de selección para la pantalla de administración
 * (CATALOGOS_WRITE) — mismo patrón que getRubros.ts en evaluations. Cada
 * rubro es un área con su criterio activo asociado.
 */
export async function getRubrosSeleccion(): Promise<GetRubrosSeleccionResult> {
  await requirePermission(PERMISOS.RECLUTAMIENTO_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_areas_seleccion')
    .select(
      'are_id, are_nombre, are_activo, sgrh_cat_criterios_seleccion ( cri_id, cri_descripcion, cri_activo )'
    )
    .eq('are_activo', true)
    .order('are_id', { ascending: true })
    .returns<AreaRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los criterios de selección.' }
  }

  const rubros: RubroSeleccionRow[] = (data ?? []).map((area) => {
    const criterio =
      area.sgrh_cat_criterios_seleccion.find((c) => c.cri_activo) ??
      area.sgrh_cat_criterios_seleccion[0] ??
      null

    return {
      areaId: area.are_id,
      criterioId: criterio?.cri_id ?? null,
      nombre: area.are_nombre,
      descripcion: criterio?.cri_descripcion ?? '',
      activo: area.are_activo,
    }
  })

  return { ok: true, data: rubros }
}
