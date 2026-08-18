import { createClient } from '@/lib/supabase/server'

export interface SucursalTema {
  sucursalId: number | null
  sucursalNombre: string | null
  colorAcento: string | null
  colorSidebar: string | null
}

const SIN_TEMA: SucursalTema = {
  sucursalId: null,
  sucursalNombre: null,
  colorAcento: null,
  colorSidebar: null,
}

interface AsignacionRow {
  uer_sucursal_id: number | null
  sgrh_sucursales: {
    suc_id: number
    suc_nombre: string
    suc_color_acento: string | null
    suc_color_sidebar: string | null
  } | null
}

/**
 * Tema (nombre + colores de apariencia) de la sucursal fija del usuario
 * autenticado. No viene en el JWT — el hook de Auth solo inyecta
 * usr_id/emp_id/rol/empresa_id/permisos — asi que se consulta en vivo. RLS
 * (`uer_select`) siempre permite ver la propia fila, sin importar el rol.
 *
 * Devuelve el tema "vacio" (sin id, sin colores) cuando el usuario no tiene
 * una sucursal fija asignada (tipico de ADMIN/RRHH, que operan sobre toda
 * la empresa) o si la consulta falla — en ambos casos el shell usa los
 * colores por defecto del sistema.
 */
export async function getSucursalTema(usrId: number | null | undefined): Promise<SucursalTema> {
  if (!usrId) return SIN_TEMA

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_usuarios_empresa_rol')
    .select(
      'uer_sucursal_id, sgrh_sucursales ( suc_id, suc_nombre, suc_color_acento, suc_color_sidebar )'
    )
    .eq('uer_usuario_id', usrId)
    .eq('uer_activo', true)
    .maybeSingle<AsignacionRow>()

  if (error || !data?.sgrh_sucursales) return SIN_TEMA

  return {
    sucursalId: data.sgrh_sucursales.suc_id,
    sucursalNombre: data.sgrh_sucursales.suc_nombre,
    colorAcento: data.sgrh_sucursales.suc_color_acento,
    colorSidebar: data.sgrh_sucursales.suc_color_sidebar,
  }
}
