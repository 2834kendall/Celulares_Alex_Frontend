'use server'

import { createClient } from '@/lib/supabase/server'
import type { PuestoRow } from '@/modules/settings/types'

export type Puesto = PuestoRow

export type GetPuestosResult = { ok: true; data: Puesto[] } | { ok: false; error: string }

/**
 * Catalogo de puestos de la empresa. No requiere CATALOGOS_WRITE: es legible
 * por cualquier autenticado de la empresa (policy "puestos_select"), igual
 * que lo consumen los formularios de empleados para el selector de puesto.
 */
export async function getPuestos(): Promise<GetPuestosResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_puestos')
    .select(
      'pue_id, pue_nombre, pue_descripcion, pue_salario_minimo_referencia, pue_activo, pue_empresa_id'
    )
    .order('pue_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los puestos.' }
  }

  return { ok: true, data }
}
