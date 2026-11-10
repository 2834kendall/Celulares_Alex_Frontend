import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import {
  toMarcaApariencia,
  type MarcaApariencia,
  type MarcaRow,
} from '@/lib/empresa/get-marca-tema'
import { leerMarcaContexto, MARCA_CONTEXTO_COOKIE } from '@/lib/empresa/marca-contexto-cookie'
import { tieneDatosPorMarca } from '@/lib/permissions/zones'
import type { SgrhJwtClaims } from '@/types/auth'

/**
 * Filtro de los listados según la marca elegida.
 *
 * `error` no es "sin filtro": traer todo mientras el aviso del layout sigue
 * nombrando una marca sería mentir sobre lo que se está viendo.
 */
export type FiltroMarca =
  | { estado: 'sin-filtro'; sucursalIds: null }
  | { estado: 'filtrado'; marcaId: number; sucursalIds: number[] }
  | { estado: 'error'; sucursalIds: null }

export interface SelectorMarca {
  /** Vacío si la cuenta no tiene selector: nunca una sola marca. */
  marcas: MarcaApariencia[]
  marcaElegida: MarcaApariencia | null
}

export const ERROR_FILTRO_MARCA =
  'No se pudo aplicar el filtro de marca. Recargá la página para reintentar.'

const SIN_FILTRO: FiltroMarca = { estado: 'sin-filtro', sucursalIds: null }
const SIN_SELECTOR: SelectorMarca = { marcas: [], marcaElegida: null }

/** Con una sola marca al alcance, filtrar no cambiaría nada. */
const MIN_MARCAS_PARA_SELECTOR = 2

interface MarcaAlcanzable {
  marca: MarcaApariencia
  /** Incluye las tiendas inactivas: los registros viejos siguen apuntando a ellas. */
  sucursalIds: number[]
}

type MarcasAlcanzables = { ok: true; marcas: MarcaAlcanzable[] } | { ok: false }

interface SucursalConMarcaRow {
  suc_id: number
  sgrh_marcas_comerciales: (MarcaRow & { mco_activa: boolean }) | null
}

const leerSesion = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const meta = (data?.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>

  return {
    supabase,
    usrId: meta.usr_id ?? null,
    empresaId: meta.empresa_id ?? null,
    permisos: Array.isArray(meta.permisos) ? meta.permisos : [],
  }
})

/**
 * Marcas que la cuenta puede elegir. Se decide con permisos y con las tiendas de
 * la cuenta, nunca con su rol: los roles se pueden crear y modificar.
 *
 * El permiso se mira primero porque el alcance solo no alcanza: una cuenta sin
 * datos operativos también da `null` ("sin restricción de sucursal").
 */
const leerMarcasAlcanzables = cache(async (): Promise<MarcasAlcanzables> => {
  const { supabase, usrId, empresaId, permisos } = await leerSesion()
  if (!empresaId || !tieneDatosPorMarca(permisos)) return { ok: true, marcas: [] }

  const alcance = usrId ? await getUsuarioSucursalScope(supabase, usrId) : null
  // Una sola tienda es una sola marca: ni hace falta preguntarlo.
  if (alcance !== null && alcance.length < MIN_MARCAS_PARA_SELECTOR) {
    return { ok: true, marcas: [] }
  }

  let consulta = supabase
    .from('sgrh_sucursales')
    .select(
      'suc_id, sgrh_marcas_comerciales ( mco_id, mco_nombre, mco_activa, mco_color_acento, mco_color_sidebar, mco_logo_path )'
    )
    .eq('suc_empresa_id', empresaId)
  if (alcance !== null) consulta = consulta.in('suc_id', alcance)

  const { data, error } = await consulta.returns<SucursalConMarcaRow[]>()
  if (error || !data) return { ok: false }

  const porMarca = new Map<number, MarcaAlcanzable>()
  for (const { suc_id, sgrh_marcas_comerciales: marca } of data) {
    // Una tienda sin marca (hasta la fase 2) solo se ve en "Todas".
    if (!marca?.mco_activa) continue
    const actual = porMarca.get(marca.mco_id)
    if (actual) actual.sucursalIds.push(suc_id)
    else porMarca.set(marca.mco_id, { marca: toMarcaApariencia(marca), sucursalIds: [suc_id] })
  }

  const marcas = [...porMarca.values()].sort((a, b) =>
    a.marca.nombre.localeCompare(b.marca.nombre, 'es')
  )
  return { ok: true, marcas: marcas.length >= MIN_MARCAS_PARA_SELECTOR ? marcas : [] }
})

/**
 * Filtro para los listados. Es lo único que deben leer: cada lectura usa
 * `filtro.sucursalIds ?? alcance`, y como ya sale acotado al alcance de la cuenta
 * no hace falta intersectar.
 *
 * La cookie va primero porque el layout no se re-renderiza al navegar: sin ella,
 * cada listado pagaría estas consultas en cada navegación. Una marca que ya no se
 * puede elegir (falsificada, de otra empresa, desactivada) se ignora.
 *
 * No lo usan las escrituras, el kiosco, los montos ni las pantallas personales.
 */
export const getFiltroMarca = cache(async (): Promise<FiltroMarca> => {
  const raw = (await cookies()).get(MARCA_CONTEXTO_COOKIE)?.value
  if (!raw) return SIN_FILTRO

  const { usrId } = await leerSesion()
  const marcaId = leerMarcaContexto(raw, usrId)
  if (marcaId === null) return SIN_FILTRO

  const alcanzables = await leerMarcasAlcanzables()
  if (!alcanzables.ok) return { estado: 'error', sucursalIds: null }

  const elegida = alcanzables.marcas.find((m) => m.marca.id === marcaId)
  return elegida ? { estado: 'filtrado', marcaId, sucursalIds: elegida.sucursalIds } : SIN_FILTRO
})

/** Selector de la barra superior y marca que pinta el shell. Solo para el layout. */
export const getSelectorMarca = cache(async (): Promise<SelectorMarca> => {
  const alcanzables = await leerMarcasAlcanzables()
  if (!alcanzables.ok || alcanzables.marcas.length === 0) return SIN_SELECTOR

  const marcas = alcanzables.marcas.map((m) => m.marca)
  const { usrId } = await leerSesion()
  const raw = (await cookies()).get(MARCA_CONTEXTO_COOKIE)?.value
  const marcaId = leerMarcaContexto(raw, usrId)

  return { marcas, marcaElegida: marcas.find((m) => m.id === marcaId) ?? null }
})
