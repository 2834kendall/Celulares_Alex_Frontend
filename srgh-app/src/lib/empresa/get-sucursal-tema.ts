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
 * Tema (nombre + colores de apariencia) de una sucursal del usuario
 * autenticado. No viene en el JWT — el hook de Auth solo inyecta
 * usr_id/emp_id/rol/empresa_id/permisos/sucursal_ids (ids, sin nombre ni
 * colores) — asi que se consulta en vivo. RLS (`uer_select`) siempre
 * permite ver las propias filas, sin importar el rol.
 *
 * Un usuario a cargo de varias sucursales puede tener varias filas activas:
 * el tema es puramente cosmetico (nombre + colores del shell), asi que se
 * toma la primera sin mas criterio — no hay una nocion de "sucursal
 * principal" que decidir aqui.
 *
 * Devuelve el tema "vacio" (sin id, sin colores) cuando el usuario no tiene
 * ninguna sucursal fija asignada (tipico de ADMIN/RRHH, que operan sobre
 * toda la empresa) o si la consulta falla — en ambos casos el shell usa los
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
    .not('uer_sucursal_id', 'is', null)
    .order('uer_id', { ascending: true })
    .limit(1)
    .maybeSingle<AsignacionRow>()

  if (error || !data?.sgrh_sucursales) return SIN_TEMA

  return {
    sucursalId: data.sgrh_sucursales.suc_id,
    sucursalNombre: data.sgrh_sucursales.suc_nombre,
    colorAcento: data.sgrh_sucursales.suc_color_acento,
    colorSidebar: data.sgrh_sucursales.suc_color_sidebar,
  }
}
