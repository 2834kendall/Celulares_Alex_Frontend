'use server'

import { createClient } from '@/lib/supabase/server'
import type { ConceptoNominaRow } from '@/modules/payroll/types'

export type GetConceptosResult =
  { ok: true; data: ConceptoNominaRow[] } | { ok: false; error: string }

/**
 * Catálogo de conceptos de nómina (BASE, COMISION, CCSS_OBRERA, etc.).
 * Es un catálogo global: legible por cualquier autenticado (policy
 * "cat_select" en sgrh_cat_conceptos_nomina), sin exigir permiso de nómina —
 * igual que getShiftTypes/getRubros en los otros módulos.
 */
export async function getConceptos(): Promise<GetConceptosResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select('*')
    .order('con_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los conceptos de nómina.' }
  }

  return { ok: true, data }
}
