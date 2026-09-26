'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeletePeriodoResult = { ok: true } | { ok: false; error: string }

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface DetalleRow {
  ndt_id: number
  ndt_pagado: boolean
}

/**
 * Elimina un periodo de planilla con todo lo que cuelga de él.
 *
 * Solo se permite si NINGÚN empleado del periodo tiene el pago marcado. No es
 * una restricción por comodidad: marcar un pago deja rastro fuera del periodo
 * —acumula la parte proporcional del aguinaldo en sgrh_provisiones_anuales y
 * emite un comprobante con su código de verificación— y revertir eso en
 * cascada tiene muchas más formas de quedar a medias que de salir bien. Si hay
 * pagos marcados se pide desmarcarlos primero, que es una acción que el
 * encargado ya conoce y que revierte esos efectos uno por uno.
 *
 * Como un periodo en estado 'pagado' es exactamente aquel donde todos están
 * pagados, esa misma regla lo cubre: no hace falta mirar npe_estado aparte.
 *
 * El orden de borrado lo imponen las llaves foráneas que apuntan a
 * sgrh_nomina_detalle: las tres tablas de líneas, los comprobantes, las
 * comisiones calculadas y —dos veces— el banco de horas.
 */
export async function deletePeriodo(periodoId: number): Promise<DeletePeriodoResult> {
  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return { ok: false, error: 'Periodo inválido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  // RLS ya limita a la empresa y sucursal visibles del JWT.
  const { data: periodo, error: errPeriodo } = await supabase
    .from('sgrh_nomina_periodo')
    .select('npe_id')
    .eq('npe_id', periodoId)
    .maybeSingle<{ npe_id: number }>()

  if (errPeriodo) {
    return { ok: false, error: 'No se pudo cargar el periodo.' }
  }
  if (!periodo) {
    return { ok: false, error: 'El periodo no existe o no es visible.' }
  }

  const { data: detalles, error: errDetalles } = await supabase
    .from('sgrh_nomina_detalle')
    .select('ndt_id, ndt_pagado')
    .eq('ndt_nomina_periodo_id', periodoId)
    .returns<DetalleRow[]>()

  if (errDetalles) {
    return { ok: false, error: 'No se pudo revisar la planilla del periodo.' }
  }

  const filas = detalles ?? []
  const pagados = filas.filter((d) => d.ndt_pagado).length

  if (pagados > 0) {
    return {
      ok: false,
      error: `No se puede eliminar un periodo con pagos ya marcados (${pagados}). Desmarcá esos pagos primero: así se revierte el aguinaldo acumulado y se retiran los comprobantes emitidos.`,
    }
  }

  const ndtIds = filas.map((d) => d.ndt_id)

  if (ndtIds.length > 0) {
    const errorDependencias = await limpiarDependencias(supabase, ndtIds)
    if (errorDependencias) {
      return { ok: false, error: errorDependencias }
    }

    const { error: errDetalle } = await supabase
      .from('sgrh_nomina_detalle')
      .delete()
      .in('ndt_id', ndtIds)

    if (errDetalle) {
      return {
        ok: false,
        error: 'No se pudo eliminar la planilla del periodo.',
      }
    }
  }

  const { error: errBorrado } = await supabase
    .from('sgrh_nomina_periodo')
    .delete()
    .eq('npe_id', periodoId)

  if (errBorrado) {
    return { ok: false, error: 'No se pudo eliminar el periodo.' }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${periodoId}`)
  revalidatePath('/payroll/banco-horas')
  return { ok: true }
}

/**
 * Suelta todo lo que referencia a estos detalles, en el orden que exigen las
 * llaves foráneas. Devuelve el mensaje de error, o null si todo salió.
 */
async function limpiarDependencias(
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
