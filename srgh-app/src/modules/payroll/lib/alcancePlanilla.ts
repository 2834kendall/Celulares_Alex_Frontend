/**
 * De qué sucursales trabaja una acción sobre un periodo de planilla, y qué
 * filas tiene el periodo aunque la cuenta no las vea.
 *
 * Hay dos modelos de periodo y este archivo es donde se distinguen:
 *
 *  - Periodo CON sucursal (npe_sucursal_id): el de siempre, uno por sucursal.
 *    Su alcance es esa sucursal.
 *  - Periodo de TODA LA EMPRESA (npe_sucursal_id NULL): uno por quincena. Cada
 *    fila lleva su sucursal (ndt_sucursal_id) y la RLS deja ver solo las de
 *    las sucursales de la cuenta. Su alcance son las sucursales que ve la
 *    cuenta y, si hay una marca elegida en el selector, solo las de esa marca.
 *
 * Solo servidor.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { ERROR_FILTRO_MARCA, getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { sucursalLabel, type SucursalConMarcaJoin } from '@/lib/empresa/marca-label'
import { sucursalesVisibles } from '@/modules/payroll/lib/derechosData'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type Claims = { app_metadata?: unknown }

/** Texto del encabezado y de los comprobantes para un periodo sin sucursal. */
export const ETIQUETA_TODA_LA_EMPRESA = 'Toda la empresa'

export const ERROR_SOLO_CUENTA_DE_EMPRESA =
  'Este periodo es de toda la empresa: solo lo puede eliminar una cuenta sin sucursal asignada.'

/** ¿La cuenta ve toda la empresa (no tiene sucursal asignada)? */
export function esCuentaDeEmpresa(claims: Claims): boolean {
  return sucursalesVisibles(claims) === null
}

export type SucursalesResult = { ok: true; sucursalIds: number[] } | { ok: false; error: string }

/**
 * Las sucursales de la empresa que la cuenta puede ver, como lista concreta
 * (también las inactivas: las filas viejas siguen apuntando a ellas). Misma
 * regla que sucursal_visible() en la base.
 */
export async function sucursalesDeLaCuenta(
  supabase: SupabaseServerClient,
  claims: Claims
): Promise<SucursalesResult> {
  const empresaId = ((claims.app_metadata ?? {}) as { empresa_id?: number }).empresa_id
  if (!empresaId) return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }

  let consulta = supabase.from('sgrh_sucursales').select('suc_id').eq('suc_empresa_id', empresaId)
  const visibles = sucursalesVisibles(claims)
  if (visibles !== null) consulta = consulta.in('suc_id', visibles)

  const { data, error } = await consulta.returns<{ suc_id: number }[]>()
  if (error || !Array.isArray(data)) {
    return { ok: false, error: 'No se pudieron cargar las sucursales de tu usuario.' }
  }
  return { ok: true, sucursalIds: data.map((s) => s.suc_id).sort((a, b) => a - b) }
}

export type AlcanceResult =
  | {
      ok: true
      /** El periodo es de toda la empresa (no tiene sucursal). */
      porEmpresa: boolean
      /** Sucursales sobre las que se trabaja. Puede venir vacía. */
      sucursalIds: number[]
    }
  | { ok: false; error: string }

/**
 * Alcance de una acción sobre el periodo (cargar empleados, plantilla).
 *
 * `conMarca: false` deja fuera el selector de marca: lo usa la subida del
 * Excel, donde el alcance ya viene sellado en el archivo.
 */
export async function alcanceDelPeriodo(
  supabase: SupabaseServerClient,
  claims: Claims,
  npeSucursalId: number | null,
  opciones: { conMarca?: boolean } = {}
): Promise<AlcanceResult> {
  if (npeSucursalId !== null) {
    return { ok: true, porEmpresa: false, sucursalIds: [npeSucursalId] }
  }

  const visibles = await sucursalesDeLaCuenta(supabase, claims)
  if (!visibles.ok) return visibles

  if (opciones.conMarca === false) {
    return { ok: true, porEmpresa: true, sucursalIds: visibles.sucursalIds }
  }

  const filtro = await getFiltroMarca()
  if (filtro.estado === 'error') return { ok: false, error: ERROR_FILTRO_MARCA }
  if (filtro.estado === 'sin-filtro') {
    return { ok: true, porEmpresa: true, sucursalIds: visibles.sucursalIds }
  }
  const deLaMarca = new Set(filtro.sucursalIds)
  return {
    ok: true,
    porEmpresa: true,
    sucursalIds: visibles.sucursalIds.filter((id) => deLaMarca.has(id)),
  }
}

/**
 * Nombre para mostrar ("Marca · Sucursal") de cada sucursal pedida. Es solo
 * un rótulo: si la lectura falla devuelve un mapa vacío y quien llama muestra
 * su texto de respaldo.
 */
export async function etiquetasDeSucursales(
  supabase: SupabaseServerClient,
  sucursalIds: number[]
): Promise<Map<number, string>> {
  const ids = [...new Set(sucursalIds)]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('sgrh_sucursales')
    .select('suc_id, suc_nombre, sgrh_marcas_comerciales ( mco_nombre )')
    .in('suc_id', ids)
    .returns<({ suc_id: number } & SucursalConMarcaJoin)[]>()
  if (error || !Array.isArray(data)) return new Map()

  const etiquetas = new Map<number, string>()
  for (const s of data) {
    const etiqueta = sucursalLabel(s)
    if (etiqueta) etiquetas.set(s.suc_id, etiqueta)
  }
  return etiquetas
}

/**
 * ¿La empresa ya trabaja con un periodo por quincena para todas sus
 * sucursales? (org_nomina_por_empresa; lo activa la migración que fusiona los
 * periodos). La RLS `empresas_select` solo deja ver la fila de la empresa del
 * JWT. null si no se pudo leer.
 */
export async function leerNominaPorEmpresa(
  supabase: SupabaseServerClient
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .select('org_nomina_por_empresa')
    .maybeSingle<{ org_nomina_por_empresa: boolean | null }>()
  if (error || !data) return null
  return data.org_nomina_por_empresa === true
}

export { leerFilasEstado, type FilaEstado, type FilasEstadoResult } from './filasEstado'

/**
 * Si `periodoId` es un periodo por sucursal que se fusionó en uno de toda la
 * empresa, el id de ese periodo (función nomina_periodo_actual). Para que un
 * enlace viejo —un marcador, un correo con el comprobante— siga abriendo.
 * null si no se fusionó o no se pudo consultar.
 */
export async function periodoFusionadoEn(
  supabase: SupabaseServerClient,
  periodoId: number
): Promise<number | null> {
  const { data, error } = await supabase.rpc('nomina_periodo_actual', { p_npe_id: periodoId })
  if (error) return null
  return typeof data === 'number' && Number.isInteger(data) && data > 0 ? data : null
}
