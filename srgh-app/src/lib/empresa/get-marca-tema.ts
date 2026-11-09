import { createClient } from '@/lib/supabase/server'

/** Identidad visual de una marca comercial, tal como la pinta el shell. */
export interface MarcaApariencia {
  id: number
  nombre: string
  colorAcento: string | null
  colorSidebar: string | null
  /** RUTA del logo en el bucket logos-empresa (no una URL), o null. */
  logoPath: string | null
}

/** Marca y sucursal "propias" del usuario, de donde sale su tema. */
export interface MarcaTema {
  sucursalId: number | null
  sucursalNombre: string | null
  marca: MarcaApariencia | null
}

export const SIN_MARCA: MarcaTema = { sucursalId: null, sucursalNombre: null, marca: null }

/** Select embebido compartido: la sucursal con su marca. */
export const SUCURSAL_CON_MARCA =
  'suc_id, suc_nombre, sgrh_marcas_comerciales ( mco_id, mco_nombre, mco_color_acento, mco_color_sidebar, mco_logo_path )'

export interface MarcaRow {
  mco_id: number
  mco_nombre: string
  mco_color_acento: string | null
  mco_color_sidebar: string | null
  mco_logo_path: string | null
}

interface SucursalRow {
  suc_id: number
  suc_nombre: string
  sgrh_marcas_comerciales: MarcaRow | null
}

export function toMarcaApariencia(row: MarcaRow): MarcaApariencia {
  return {
    id: row.mco_id,
    nombre: row.mco_nombre,
    colorAcento: row.mco_color_acento,
    colorSidebar: row.mco_color_sidebar,
    logoPath: row.mco_logo_path,
  }
}

function fromSucursal(row: SucursalRow | null | undefined): MarcaTema | null {
  if (!row) return null
  return {
    sucursalId: row.suc_id,
    sucursalNombre: row.suc_nombre,
    marca: row.sgrh_marcas_comerciales ? toMarcaApariencia(row.sgrh_marcas_comerciales) : null,
  }
}

/**
 * Marca (y sucursal) del usuario autenticado, para pintar el shell. No viene
 * en el JWT, así que se consulta en vivo. Dos fuentes, en este orden:
 *
 * 1. La sucursal asignada a la CUENTA (`uer_sucursal_id`): la de un GERENTE,
 *    o la que se le haya puesto a la cuenta de un empleado. RLS (`uer_select`)
 *    siempre deja ver las filas propias.
 * 2. Si la cuenta no tiene sucursal, la sucursal base del CONTRATO VIGENTE del
 *    empleado (`historial_select` deja ver el propio por `emp_id`). Es lo que
 *    cubre al EMPLEADO: su cuenta suele no tener sucursal. Un turno prestado en
 *    una tienda de otra marca no le cambia el tema: cuenta el contrato.
 *
 * Las dos consultas salen en paralelo (cada viaje son ~200 ms); la segunda
 * solo se usa si la primera no dio nada.
 *
 * Con varias sucursales asignadas se toma la primera: no hay una noción de
 * "sucursal principal" que decidir acá. Devuelve SIN_MARCA si el usuario
 * opera a nivel empresa (ADMIN) o si algo falla: el shell cae al tema de la
 * empresa y, si no hay, al del sistema.
 */
export async function getMarcaTema(
  usrId: number | null | undefined,
  empId: number | null | undefined
): Promise<MarcaTema> {
  if (!usrId) return SIN_MARCA

  const supabase = await createClient()
  const [cuenta, contrato] = await Promise.all([
    supabase
      .from('sgrh_usuarios_empresa_rol')
      .select(`uer_sucursal_id, sgrh_sucursales ( ${SUCURSAL_CON_MARCA} )`)
      .eq('uer_usuario_id', usrId)
      .eq('uer_activo', true)
      .not('uer_sucursal_id', 'is', null)
      .order('uer_id', { ascending: true })
      .limit(1)
      .maybeSingle<{ uer_sucursal_id: number | null; sgrh_sucursales: SucursalRow | null }>(),
    empId
      ? supabase
          .from('sgrh_historial_laboral')
          .select(`lab_sucursal_id, sgrh_sucursales ( ${SUCURSAL_CON_MARCA} )`)
          .eq('lab_empleado_id', empId)
          .is('lab_fecha_fin', null)
          .order('lab_fecha_inicio', { ascending: false })
          .limit(1)
          .maybeSingle<{ lab_sucursal_id: number; sgrh_sucursales: SucursalRow | null }>()
      : Promise.resolve({ data: null, error: null }),
  ])

  return (
    (!cuenta.error && fromSucursal(cuenta.data?.sgrh_sucursales)) ||
    (!contrato.error && fromSucursal(contrato.data?.sgrh_sucursales)) ||
    SIN_MARCA
  )
}
