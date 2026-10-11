'use server'

import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { CatalogoItem, MotivoSalidaItem, TerritorioCatalogo } from '@/modules/employees/types'

export type GetCatalogoResult = { ok: true; data: CatalogoItem[] } | { ok: false; error: string }

export type GetTerritorioResult =
  { ok: true; data: TerritorioCatalogo } | { ok: false; error: string }

const CATALOG_ERROR = 'No se pudo cargar el catálogo.'

// ---------------------------------------------------------------------------
// Catálogos GLOBALES cacheados
// ---------------------------------------------------------------------------
//
// Son iguales para todas las empresas (policy `cat_select` con USING (true)),
// así que se guardan en el Data Cache de Next y se leen de Supabase una vez por
// hora (el territorio, una vez al día) en vez de en cada carga de página.
//
// Reglas para agregar uno sin abrir un hueco:
// - El `requirePermission` va SIEMPRE en la acción, antes de leer del caché:
//   se cachea el dato, nunca la decisión de autorización.
// - La lectura usa el cliente admin porque `unstable_cache` no admite
//   `cookies()` adentro. Eso solo es aceptable en tablas SIN columna de
//   empresa: puestos y sucursales (por empresa) no pasan por acá.
// - Si la consulta falla, se lanza: así el fallo no queda cacheado y el
//   siguiente request vuelve a intentar.
// - Tipos de jornada NO se cachea: Horarios los crea, edita y borra.

const CATALOGOS_TAG = 'catalogos'
const UNA_HORA = 3600
const UN_DIA = 86400

type AdminClient = ReturnType<typeof createAdminClient>

function cachedCatalog<T>(
  key: string,
  revalidate: number,
  fetcher: (supabase: AdminClient) => Promise<T>
): () => Promise<T | null> {
  const cached = unstable_cache(() => fetcher(createAdminClient()), ['catalogo', key], {
    revalidate,
    tags: [CATALOGOS_TAG],
  })

  return async () => {
    try {
      return await cached()
    } catch {
      return null
    }
  }
}

/** Devuelve las filas o lanza, para que unstable_cache no guarde el fallo. */
function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error || result.data === null) {
    throw result.error ?? new Error('Catálogo sin datos')
  }
  return result.data
}

function toResult<T>(data: T | null): { ok: true; data: T } | { ok: false; error: string } {
  return data === null ? { ok: false, error: CATALOG_ERROR } : { ok: true, data }
}

const fetchTiposContrato = cachedCatalog('tipos_contrato', UNA_HORA, async (supabase) =>
  unwrap(
    await supabase
      .from('sgrh_cat_tipos_contrato')
      .select('tco_id, tco_nombre')
      .order('tco_nombre', { ascending: true })
  ).map((t): CatalogoItem => ({ id: t.tco_id, nombre: t.tco_nombre }))
)

const fetchMotivosSalida = cachedCatalog('motivos_salida', UNA_HORA, async (supabase) =>
  unwrap(
    await supabase
      .from('sgrh_cat_motivos_salida')
      .select('mot_id, mot_nombre, mot_genera_cesantia, mot_genera_preaviso, mot_nota_legal')
      .order('mot_nombre', { ascending: true })
  ).map((m): MotivoSalidaItem => ({
    id: m.mot_id,
    nombre: m.mot_nombre,
    generaCesantia: m.mot_genera_cesantia,
    generaPreaviso: m.mot_genera_preaviso,
    notaLegal: m.mot_nota_legal,
  }))
)

const fetchTiposIdentificacion = cachedCatalog('tipos_identificacion', UNA_HORA, async (supabase) =>
  unwrap(
    await supabase
      .from('sgrh_cat_tipos_identificacion')
      .select('tid_id, tid_nombre')
      .eq('tid_activo', true)
      .order('tid_nombre', { ascending: true })
  ).map((t): CatalogoItem => ({ id: t.tid_id, nombre: t.tid_nombre }))
)

const fetchBancos = cachedCatalog('bancos', UNA_HORA, async (supabase) =>
  unwrap(
    await supabase
      .from('sgrh_cat_bancos')
      .select('ban_id, ban_nombre')
      .eq('ban_activo', true)
      .order('ban_nombre', { ascending: true })
  ).map((b): CatalogoItem => ({ id: b.ban_id, nombre: b.ban_nombre }))
)

/**
 * División territorial de Costa Rica completa (IGN: 7 provincias, 84 cantones,
 * 492 distritos) para la cascada de dirección.
 *
 * Se trae entera de una vez en lugar de un nivel por petición: son ~5 KB
 * comprimidos de datos que no cambian, y pedir los cantones al elegir provincia
 * agregaría un round-trip visible en medio del formulario. La cascada filtra en
 * memoria por provinciaId / cantonId.
 */
const fetchTerritorio = cachedCatalog(
  'territorio',
  UN_DIA,
  async (supabase): Promise<TerritorioCatalogo> => {
    const [provincias, cantones, distritos] = await Promise.all([
      supabase.from('sgrh_cat_provincias').select('prv_id, prv_nombre').order('prv_nombre'),
      supabase
        .from('sgrh_cat_cantones')
        .select('can_id, can_nombre, can_provincia_id')
        .order('can_nombre'),
      // 492 filas: por debajo del límite por defecto de PostgREST (1000).
      supabase
        .from('sgrh_cat_distritos')
        .select('dis_id, dis_nombre, dis_canton_id, dis_codigo')
        .order('dis_nombre'),
    ])

    return {
      provincias: unwrap(provincias).map((p) => ({ id: p.prv_id, nombre: p.prv_nombre })),
      cantones: unwrap(cantones).map((c) => ({
        id: c.can_id,
        nombre: c.can_nombre,
        provinciaId: c.can_provincia_id,
      })),
      distritos: unwrap(distritos).map((d) => ({
        id: d.dis_id,
        nombre: d.dis_nombre,
        cantonId: d.dis_canton_id,
        codigoPostal: d.dis_codigo,
      })),
    }
  }
)

// Sin order alfabético a propósito: el orden natural (tdo_id) es el orden del
// seed, que deja "Otro" al final.
const fetchTiposDocumento = cachedCatalog('tipos_documento', UNA_HORA, async (supabase) =>
  unwrap(
    await supabase
      .from('sgrh_cat_tipos_documento')
      .select('tdo_id, tdo_nombre')
      .eq('tdo_activo', true)
  ).map((t): CatalogoItem => ({ id: t.tdo_id, nombre: t.tdo_nombre }))
)

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Puestos activos de la empresa (RLS filtra por empresa). */
export async function getPuestos(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_puestos')
    .select('pue_id, pue_nombre')
    .eq('pue_activo', true)
    .order('pue_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((p) => ({ id: p.pue_id, nombre: p.pue_nombre })) }
}

/** Sucursales activas de la empresa (RLS filtra por empresa). */
export async function getSucursales(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_sucursales')
    .select('suc_id, suc_nombre')
    .eq('suc_activa', true)
    .order('suc_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((s) => ({ id: s.suc_id, nombre: s.suc_nombre })) }
}

/** Catálogo global de tipos de contrato (cacheado). */
export async function getTiposContrato(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  return toResult(await fetchTiposContrato())
}

/**
 * Catálogo global de tipos de jornada. Sin caché: el módulo Horarios los
 * crea, edita y borra (createShiftType / updateShiftType / deleteShiftType).
 */
export async function getTiposJornada(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_jornada')
    .select('tjo_id, tjo_nombre')
    .order('tjo_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((t) => ({ id: t.tjo_id, nombre: t.tjo_nombre })) }
}

export type GetMotivosSalidaResult =
  { ok: true; data: MotivoSalidaItem[] } | { ok: false; error: string }

/**
 * Catálogo global de motivos de salida, para terminar un contrato (cacheado).
 * El de payroll exige NOMINA_READ, que quien administra contratos no
 * necesariamente tiene.
 */
export async function getMotivosSalida(): Promise<GetMotivosSalidaResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  return toResult(await fetchMotivosSalida())
}

/** Catálogo global de tipos de identificación activos (cacheado). */
export async function getTiposIdentificacion(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  return toResult(await fetchTiposIdentificacion())
}

/** Catálogo global de bancos activos (sgrh_cat_bancos, cacheado). */
export async function getBancos(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  return toResult(await fetchBancos())
}

/** División territorial de Costa Rica (cacheada un día, ver fetchTerritorio). */
export async function getTerritorio(): Promise<GetTerritorioResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  return toResult(await fetchTerritorio())
}

/**
 * Catálogo global de tipos de documento (SGRH-67, fase 2B; cacheado). Gated
 * por DOCUMENTOS_READ (no EMPLEADOS_READ) — mismo criterio que getRoles con
 * USUARIOS_WRITE: es el permiso de dominio, no el genérico de empleados.
 */
export async function getTiposDocumento(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.DOCUMENTOS_READ)

  return toResult(await fetchTiposDocumento())
}

/** Roles activos del sistema — solo para el paso de usuario del onboarding. */
export async function getRoles(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.USUARIOS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_roles')
    .select('rol_id, rol_nombre')
    .eq('rol_activo', true)
    .order('rol_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((r) => ({ id: r.rol_id, nombre: r.rol_nombre })) }
}
