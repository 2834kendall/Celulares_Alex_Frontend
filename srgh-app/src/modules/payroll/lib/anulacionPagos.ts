/**
 * Anulación de un pago de aguinaldo o de liquidación hecho por error
 * (migración 20261107130000). Lo que decide si se anula vive en la base
 * (anular_pago_extraordinario): plazo, motivo, permiso y sucursal. Acá solo se
 * lee el plazo para mostrar —o no— el botón, y se arma el historial.
 *
 * Solo servidor.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { AnulacionPago } from '@/modules/payroll/types'
import { HORAS_ANULAR_PAGO_DEFAULT, HORAS_ANULAR_PAGO_MIN } from './anulacionPagosReglas'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Columnas del pago que hacen falta para la anulación y su historial. */
export const SELECT_ANULACION =
  'pex_pagado_en, pex_anulado_en, pex_anulado_por_nombre, pex_motivo_anulacion'

export interface AnulacionRow {
  pex_pagado_en: string
  pex_anulado_en: string | null
  pex_anulado_por_nombre: string | null
  pex_motivo_anulacion: string | null
}

/**
 * Horas de la empresa para anular un pago. La RLS `empresas_select` solo deja
 * ver la fila de la empresa del JWT. null si no se pudo leer: no se muestra
 * el botón (la base igual decide al anular).
 */
export async function leerHorasParaAnular(supabase: SupabaseServerClient): Promise<number | null> {
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .select('org_horas_anular_pago')
    .maybeSingle<{ org_horas_anular_pago: number | null }>()
  if (error || !data) return null
  const horas = Number(data.org_horas_anular_pago ?? HORAS_ANULAR_PAGO_DEFAULT)
  return Number.isInteger(horas) && horas >= HORAS_ANULAR_PAGO_MIN ? horas : null
}

/**
 * Hasta cuándo se puede anular un pago vigente. null si ya venció, si está
 * anulado o si no se sabe el plazo. Se calcula en el servidor y se manda ya
 * resuelto: decidirlo en el navegador con su reloj daría otro resultado al
 * hidratar.
 */
export function anulableHasta(
  pago: Pick<AnulacionRow, 'pex_pagado_en' | 'pex_anulado_en'>,
  horas: number | null,
  ahora: number = Date.now()
): string | null {
  if (horas === null || pago.pex_anulado_en) return null
  const pagadoEn = Date.parse(pago.pex_pagado_en)
  if (!Number.isFinite(pagadoEn)) return null
  const hasta = pagadoEn + horas * 3_600_000
  return ahora < hasta ? new Date(hasta).toISOString() : null
}

/** La anulación de un pago, para el historial. null si el pago está vigente. */
export function anulacionDe(pago: AnulacionRow): AnulacionPago | null {
  if (!pago.pex_anulado_en) return null
  return {
    fecha: pago.pex_anulado_en,
    por: pago.pex_anulado_por_nombre?.trim() || null,
    motivo: pago.pex_motivo_anulacion ?? '',
  }
}

/**
 * De todos los pagos de un aguinaldo o una liquidación (los anulados quedan
 * en la tabla), el vigente y la anulación más reciente.
 */
export function separarPagos<T extends AnulacionRow>(
  pagos: T[]
): { vigente: T | null; ultimaAnulacion: AnulacionPago | null } {
  const vigente = pagos.find((p) => !p.pex_anulado_en) ?? null
  const anulados = pagos
    .filter((p) => p.pex_anulado_en)
    .sort((a, b) => (a.pex_anulado_en! < b.pex_anulado_en! ? 1 : -1))
  return { vigente, ultimaAnulacion: anulados[0] ? anulacionDe(anulados[0]) : null }
}
