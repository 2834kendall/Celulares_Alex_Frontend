import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Valida que las sucursales dadas pertenezcan a la empresa del JWT.
export async function branchesBelongToEmpresa(
  supabase: SupabaseServerClient,
  empresaId: number,
  branchIds: number[]
): Promise<boolean> {
  const distinctIds = Array.from(new Set(branchIds))
  if (distinctIds.length === 0) return true

  const { data, error } = await supabase
    .from('sgrh_sucursales')
    .select('suc_id')
    .in('suc_id', distinctIds)
    .eq('suc_empresa_id', empresaId)

  return !error && (data ?? []).length === distinctIds.length
}

/**
 * Las sucursales de los dos bloques de una plantilla (SGRH-110) tienen que ser
 * de la empresa. Sin sucursales definidas no hay nada que validar.
 */
export async function templateBranchesBelongToEmpresa(
  supabase: SupabaseServerClient,
  empresaId: number,
  columns: { hor_sucursal_id?: number | null; hor_sucursal_id_2?: number | null }
): Promise<boolean> {
  const ids = [columns.hor_sucursal_id, columns.hor_sucursal_id_2].filter(
    (id): id is number => typeof id === 'number'
  )
  return branchesBelongToEmpresa(supabase, empresaId, ids)
}
