/**
 * Todas las filas de un periodo de planilla, sin montos (función de la base
 * nomina_filas_estado). Va aparte de alcancePlanilla.ts para que la puedan
 * usar los módulos de cálculo sin arrastrar el contexto de la sesión.
 *
 * Solo servidor.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Una fila del periodo tal como la devuelve nomina_filas_estado: sin montos. */
export interface FilaEstado {
  ndt_historial_laboral_id: number
  ndt_pagado: boolean
  ndt_fecha_pago: string | null
}

export type FilasEstadoResult = { ok: true; data: FilaEstado[] } | { ok: false }

/**
 * TODAS las filas del periodo —también las de sucursales que la cuenta no ve—
 * con su contrato, si están pagadas y cuándo (función nomina_filas_estado).
 *
 * Con el periodo por empresa la RLS le muestra a una cuenta de sucursal solo
 * sus filas. Decidir con eso si el periodo está pagado, o si un contrato ya
 * está cargado, daría la respuesta equivocada sin ningún error.
 */
export async function leerFilasEstado(
  supabase: SupabaseServerClient,
  periodoId: number
): Promise<FilasEstadoResult> {
  const { data, error } = await supabase.rpc('nomina_filas_estado', { p_npe_id: periodoId })
  if (error) return { ok: false }
  return { ok: true, data: Array.isArray(data) ? (data as FilaEstado[]) : [] }
}
