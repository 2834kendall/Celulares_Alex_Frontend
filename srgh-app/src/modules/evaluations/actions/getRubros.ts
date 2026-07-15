'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_EVALUACIONES } from '@/lib/permissions/zones'
import type { RubroRow } from '@/modules/evaluations/types'

interface CriterioJoin {
  cri_id: number
  cri_descripcion: string
  cri_activo: boolean
}

interface AreaRow {
  are_id: number
  are_nombre: string
  are_activo: boolean
  sgrh_cat_criterios_evaluacion: CriterioJoin[]
}

export type GetRubrosResult = { ok: true; data: RubroRow[] } | { ok: false; error: string }

/*
  Cada rubro es un area de evaluacion con su criterio activo asociado.
  Solo se listan las areas activas; el criterio guarda la descripcion corta.
 */
export async function getRubros(): Promise<GetRubrosResult> {
  await requireAnyPermission(ACCESO_EVALUACIONES)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_areas_evaluacion')
    .select(
      'are_id, are_nombre, are_activo, sgrh_cat_criterios_evaluacion ( cri_id, cri_descripcion, cri_activo )'
    )
    .eq('are_activo', true)
    .order('are_id', { ascending: true })
    .returns<AreaRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los rubros de evaluacion.' }
  }

  const rubros: RubroRow[] = (data ?? []).map((area) => {
    const criterio =
      area.sgrh_cat_criterios_evaluacion.find((c) => c.cri_activo) ??
      area.sgrh_cat_criterios_evaluacion[0] ??
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
