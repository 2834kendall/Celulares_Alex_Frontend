import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface EmpresaShellRow {
  org_nombre_fantasia: string | null
  org_nombre_social: string
  org_formato_hora: string | null
}

/**
 * La fila de la empresa del JWT con lo que pinta el shell (nombre y formato de
 * hora), leída UNA vez por request: el layout y el dashboard la piden por
 * separado y antes eran dos consultas a la misma fila (tres con el dashboard).
 *
 * No filtra por empresa_id: la RLS `empresas_select` solo expone la fila de
 * la empresa del JWT. Devuelve null ante cualquier fallo; cada lector decide
 * su valor por defecto.
 */
export const getEmpresaShell = cache(async (): Promise<EmpresaShellRow | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .select('org_nombre_fantasia, org_nombre_social, org_formato_hora')
    .maybeSingle()

  return error || !data ? null : data
})
