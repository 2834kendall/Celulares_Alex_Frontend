import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export interface SalarioContrato {
  lab_salario_base: number
  lab_salario_real: number
}

export type FetchSalariosResult =
  { ok: true; data: Map<number, SalarioContrato> } | { ok: false; error: string }

/**
 * Obtiene lab_salario_base y lab_salario_real para un conjunto de contratos
 * vía la RPC `obtener_salarios_historial`, desacoplando la lectura de salarios
 * de las consultas directas sobre `sgrh_historial_laboral`.
 */
export async function fetchSalariosContratos(
  supabase: SupabaseClient<Database>,
  labIds: readonly number[]
): Promise<FetchSalariosResult> {
  const ids = Array.from(
    new Set(labIds.filter((id) => Number.isInteger(id) && Number.isFinite(id) && id > 0))
  )

  if (ids.length === 0) {
    return { ok: true, data: new Map<number, SalarioContrato>() }
  }

  const { data, error } = await supabase.rpc('obtener_salarios_historial', {
    p_lab_ids: ids,
  })

  if (error) {
    return {
      ok: false,
      error: error.message || 'No se pudieron cargar los salarios de los contratos.',
    }
  }

  const salarios = new Map<number, SalarioContrato>()
  for (const row of data ?? []) {
    salarios.set(row.lab_id, {
      lab_salario_base: Number(row.lab_salario_base),
      lab_salario_real: Number(row.lab_salario_real),
    })
  }

  return { ok: true, data: salarios }
}
