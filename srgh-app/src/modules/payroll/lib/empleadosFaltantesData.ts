/**
 * Lee, para un periodo de toda la empresa, quiénes faltan (ver
 * empleadosFaltantes.ts). Solo servidor.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { alcanceDelPeriodo } from '@/modules/payroll/lib/alcancePlanilla'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import {
  empleadosQueFaltan,
  type EmpleadosQueFaltan,
} from '@/modules/payroll/lib/empleadosFaltantes'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Lo mismo, leyendo los activos del alcance de la cuenta. Es informativo: si
 * algo falla devuelve null y la pantalla sale sin el aviso (el botón sigue ahí
 * y dice el error al usarlo).
 *
 * `filasDelPeriodo` son TODAS las filas del periodo (nomina_filas_estado),
 * también las de sucursales que la cuenta no ve: alguien trasladado puede
 * tener su fila en otra sucursal y no falta.
 */
export async function leerEmpleadosQueFaltan(
  supabase: SupabaseServerClient,
  claims: { app_metadata?: unknown },
  periodo: { fechaFin: string | null },
  filasDelPeriodo: { ndt_historial_laboral_id: number }[]
): Promise<EmpleadosQueFaltan | null> {
  try {
    const alcance = await alcanceDelPeriodo(supabase, claims, null)
    if (!alcance.ok) return null
    const activos = await getEmpleadosActivos(supabase, alcance.sucursalIds, {
      finPeriodo: periodo.fechaFin,
    })
    if (!activos.ok) return null
    return empleadosQueFaltan(
      activos.data,
      filasDelPeriodo.map((f) => f.ndt_historial_laboral_id)
    )
  } catch (err) {
    console.error('leerEmpleadosQueFaltan: no se pudo calcular quién falta', err)
    return null
  }
}
