'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { CriterioSeleccionItem } from '@/modules/recruitment/types'

interface AreaQueryRow {
  are_id: number
  are_nombre: string
  are_color: string | null
  are_peso: number
  sgrh_cat_criterios_seleccion: { cri_id: number; cri_descripcion: string; cri_activo: boolean }[]
}

export type GetSelectionCriteriaResult =
  { ok: true; data: CriterioSeleccionItem[] } | { ok: false; error: string }

/**
 * Criterios de puntaje activos (SGRH-61). Catálogo global editable por
 * Edwin desde la pantalla de catálogos (permiso CATALOGOS_WRITE) — acá solo
 * se lee, con el permiso de dominio de Reclutamiento.
 *
 * Se filtra por área activa, no por criterio: mismo criterio "rubro"
 * (área + criterio como unidad) que ya usa getRubros.ts en evaluations —
 * deleteRubro desactiva ambos juntos.
 */
export async function getSelectionCriteria(): Promise<GetSelectionCriteriaResult> {
  await requirePermission(PERMISOS.RECLUTAMIENTO_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_areas_seleccion')
    .select(
      'are_id, are_nombre, are_color, are_peso, sgrh_cat_criterios_seleccion ( cri_id, cri_descripcion, cri_activo )'
    )
    .eq('are_activo', true)
    .order('are_id', { ascending: true })
    .returns<AreaQueryRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los criterios de selección.' }
  }

  const criterios: CriterioSeleccionItem[] = (data ?? []).flatMap((area) =>
    area.sgrh_cat_criterios_seleccion
      .filter((criterio) => criterio.cri_activo)
      .map((criterio) => ({
        id: criterio.cri_id,
        descripcion: criterio.cri_descripcion,
        areaId: area.are_id,
        areaNombre: area.are_nombre,
        color: area.are_color,
        peso: area.are_peso,
      }))
  )

  return { ok: true, data: criterios }
}
