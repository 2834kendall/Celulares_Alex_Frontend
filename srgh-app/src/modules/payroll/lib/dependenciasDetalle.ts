/**
 * Lo que cuelga de una fila de planilla (sgrh_nomina_detalle) y hay que
 * soltar antes de borrarla. Lo comparten deletePeriodo (el periodo entero) y
 * uploadPlanilla (empleados que salieron del Excel).
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

/**
 * Suelta todo lo que referencia a estos detalles, en el orden que exigen las
 * llaves foráneas. Devuelve el mensaje de error, o null si todo salió.
 */
export async function limpiarDependenciasDetalle(
  supabase: SupabaseServerClient,
  ndtIds: number[]
): Promise<string | null> {
  // 1. Horas de banco que se PAGARON en este periodo pero nacieron en otro.
  //    Esas no se borran: el movimiento sigue existiendo, lo que deja de ser
  //    cierto es que se pagó. Vuelven a 'pendiente' para que el encargado las
  //    resuelva de nuevo; si se borraran, esas horas extra desaparecerían sin
  //    que nadie las haya pagado ni compensado.
  const { error: errRevertir } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .update({
      bhm_estado: 'pendiente',
      bhm_monto_pagado: null,
      bhm_nomina_detalle_pago_id: null,
      bhm_resuelto_por_id: null,
      bhm_fecha_resolucion: null,
    })
    .in('bhm_nomina_detalle_pago_id', ndtIds)

  if (errRevertir) {
    return 'No se pudieron devolver a pendientes las horas de banco pagadas en este periodo.'
  }

  // 2. Movimientos GENERADOS por este periodo: sin el detalle que los originó
  //    no tienen de dónde colgar (bhm_nomina_detalle_id es NOT NULL).
  const { error: errBanco } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .delete()
    .in('bhm_nomina_detalle_id', ndtIds)

  if (errBanco) {
    return 'No se pudo limpiar el banco de horas del periodo.'
  }

  // 3. Comisiones: la comisión sigue existiendo aunque la planilla donde se
  //    iba a pagar desaparezca, así que solo se suelta el vínculo.
  const { error: errComisiones } = await supabase
    .from('sgrh_comisiones_calculadas')
    .update({ cal_nomina_detalle_id: null })
    .in('cal_nomina_detalle_id', ndtIds)

  if (errComisiones) {
    return 'No se pudieron desvincular las comisiones del periodo.'
  }

  // 4. Comprobantes. Un detalle impago no debería tener uno (se emite al marcar
  //    el pago y se retira al desmarcarlo), pero si alguno quedó suelto por un
  //    fallo a mitad de camino, esto lo limpia en vez de tumbar el borrado.
  const { error: errComprobantes } = await supabase
    .from('sgrh_comprobantes_pago')
    .delete()
    .in('com_nomina_detalle_id', ndtIds)

  if (errComprobantes) {
    return 'No se pudieron eliminar los comprobantes del periodo.'
  }

  // 5. Las tres tablas de líneas.
  const tablasLineas = [
    { tabla: 'sgrh_nomina_linea_ingreso', columna: 'ing_nomina_detalle_id' },
    { tabla: 'sgrh_nomina_linea_deduccion', columna: 'ded_nomina_detalle_id' },
    { tabla: 'sgrh_nomina_linea_patronal', columna: 'pat_nomina_detalle_id' },
  ] as const

  for (const { tabla, columna } of tablasLineas) {
    const { error } = await supabase.from(tabla).delete().in(columna, ndtIds)
    if (error) {
      return 'No se pudieron eliminar las líneas de la planilla.'
    }
  }

  return null
}
