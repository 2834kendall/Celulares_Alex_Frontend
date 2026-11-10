import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Nombre visible del rol de la sesión («Gerente de Sucursal»), a partir del
 * código que trae el JWT (`app_metadata.rol`).
 *
 * El código ya no sirve para mostrar: los roles de cada empresa tienen códigos
 * generados (`EMPRESA_1_GERENTE`, `EMPRESA_1_40`). Se lee con el cliente de
 * sesión: la RLS `roles_select` solo expone los roles de la empresa del JWT y
 * los del sistema. Una consulta por request (el layout y el perfil la piden
 * por separado). Ante cualquier fallo devuelve null y la UI no muestra el rol.
 */
export const getRolNombre = cache(async (codigo: string | null): Promise<string | null> => {
  if (!codigo) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_roles')
    .select('rol_nombre')
    .eq('rol_codigo', codigo)
    .maybeSingle()
  return error || !data ? null : data.rol_nombre
})
