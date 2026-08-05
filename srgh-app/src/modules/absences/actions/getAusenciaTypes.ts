'use server'

import { createClient } from '@/lib/supabase/server'
import type { AusenciaTypeRow } from '@/modules/absences/types'

export type GetAusenciaTypesResult =
  { ok: true; data: AusenciaTypeRow[] } | { ok: false; error: string }

/*
 Catalogo legal de incapacidades y licencias (sembrado por migracion). No
 requiere permiso especifico: es un catalogo global, legible por cualquier
 autenticado (policy "cat_select" en sgrh_cat_tipos_ausencia).
 */
export async function getAusenciaTypes(): Promise<GetAusenciaTypesResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_ausencia')
    .select('*')
    .order('tau_nombre', { ascending: true })
    .returns<AusenciaTypeRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los tipos de ausencia.' }
  }

  return { ok: true, data }
}
