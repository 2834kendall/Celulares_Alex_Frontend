import { createClient } from '@/lib/supabase/server'

interface AsignacionRow {
  uer_sucursal_id: number | null
  sgrh_sucursales: { suc_nombre: string | null } | null
}

/**
 * Sucursal asignada al usuario autenticado (uer_sucursal_id), para mostrarla
 * bajo el nombre de la empresa en el shell. No viene en el JWT — el hook
 * de Auth solo inyecta usr_id/emp_id/rol/empresa_id/permisos — así que se
 * consulta en vivo. RLS (`uer_select`) siempre permite ver la propia fila
 * (uer_usuario_id = get_usr_id()), sin importar el rol.
 *
 * Devuelve null cuando el usuario no tiene una sucursal fija asignada
 * (típico de ADMIN/RRHH, que operan sobre toda la empresa) o si la consulta
 * falla — en ambos casos el shell simplemente omite la línea de sucursal.
 */
export async function getSucursalActual(usrId: number | null | undefined): Promise<string | null> {
  if (!usrId) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_sucursal_id, sgrh_sucursales ( suc_nombre )')
    .eq('uer_usuario_id', usrId)
    .eq('uer_activo', true)
    .maybeSingle<AsignacionRow>()

  if (error || !data) return null

  return data.sgrh_sucursales?.suc_nombre ?? null
}
