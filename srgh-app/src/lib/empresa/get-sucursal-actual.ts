import { createClient } from '@/lib/supabase/server'

interface AsignacionRow {
  uer_sucursal_id: number | null
  sgrh_sucursales: { suc_nombre: string | null } | null
}

/**
 * Sucursales asignadas al usuario autenticado (uer_sucursal_id), para
 * mostrarlas bajo el nombre de la empresa en el shell. No vienen en el
 * JWT en esta forma — el hook de Auth solo inyecta usr_id/emp_id/rol/
 * empresa_id/permisos/sucursal_ids (ids, sin nombre) — así que se
 * consultan en vivo. RLS (`uer_select`) siempre permite ver las propias
 * filas (uer_usuario_id = get_usr_id()), sin importar el rol.
 *
 * Devuelve un arreglo vacío cuando el usuario no tiene sucursal fija
 * asignada (típico de ADMIN/RRHH, que operan sobre toda la empresa), o
 * cuando alguna de sus filas activas no tiene sucursal (ese "sin
 * restricción" prevalece sobre cualquier otra sucursal puntual, igual que
 * en sucursal_visible) — y también si la consulta falla.
 */
export async function getSucursalActual(usrId: number | null | undefined): Promise<string[]> {
  if (!usrId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_sucursal_id, sgrh_sucursales ( suc_nombre )')
    .eq('uer_usuario_id', usrId)
    .eq('uer_activo', true)
    .returns<AsignacionRow[]>()

  if (error || !data) return []

  if (data.some((fila) => fila.uer_sucursal_id === null)) return []

  return data
    .map((fila) => fila.sgrh_sucursales?.suc_nombre)
    .filter((nombre): nombre is string => Boolean(nombre))
}
