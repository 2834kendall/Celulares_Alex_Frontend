/**
 * Revisión previa al borrado de filas de planilla (sgrh_nomina_detalle), para
 * dar un mensaje con nombres. El borrado en sí lo hacen las funciones
 * eliminar_periodo_nomina y eliminar_filas_planilla, en una transacción, y
 * repiten esta misma validación. Lo usan deletePeriodo y uploadPlanilla.
 *
 * Solo servidor.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Filas cuyas horas extra ya salieron del banco de horas: el movimiento que
 * generaron está pagado (en otra quincena) o compensado con tiempo libre.
 *
 * Esas filas no se pueden borrar. El movimiento cuelga de la fila
 * (bhm_nomina_detalle_id es NOT NULL), así que borrarla obliga a borrar el
 * movimiento: un pago hecho en otra planilla quedaba sin registro y ya no se
 * podía revertir, y una compensación desaparecía.
 */
export async function filasConHorasDeBancoResueltas(
  supabase: SupabaseServerClient,
  ndtIds: number[]
): Promise<{ ok: true; ndtIds: number[] } | { ok: false }> {
  if (ndtIds.length === 0) return { ok: true, ndtIds: [] }
  const { data, error } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .select('bhm_nomina_detalle_id, bhm_estado')
    .in('bhm_nomina_detalle_id', ndtIds)
    .neq('bhm_estado', 'pendiente')
    .returns<{ bhm_nomina_detalle_id: number; bhm_estado: string }[]>()
  if (error) return { ok: false }
  const filas = Array.isArray(data) ? data : []
  return { ok: true, ndtIds: [...new Set(filas.map((m) => m.bhm_nomina_detalle_id))] }
}
