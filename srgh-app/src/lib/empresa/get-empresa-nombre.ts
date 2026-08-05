import { createClient } from '@/lib/supabase/server'
import { BRAND } from '@/lib/brand'

/**
 * Nombre real de la empresa del usuario autenticado.
 *
 * No hace falta filtrar por empresa_id: la política RLS `empresas_select`
 * solo expone la fila cuyo org_id coincide con el empresa_id del JWT
 * (`get_empresa_id()`), así que `maybeSingle()` devuelve exactamente esa.
 * Ante cualquier fallo se degrada al nombre de marca por defecto para no
 * romper el shell de la aplicación.
 */
export async function getEmpresaNombre(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .select('org_nombre_fantasia, org_nombre_social')
    .maybeSingle()

  if (error || !data) {
    return BRAND.empresa
  }

  return data.org_nombre_fantasia?.trim() || data.org_nombre_social
}
