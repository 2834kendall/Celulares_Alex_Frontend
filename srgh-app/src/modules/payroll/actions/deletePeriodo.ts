'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { filasConHorasDeBancoResueltas } from '@/modules/payroll/lib/dependenciasDetalle'

export type DeletePeriodoResult = { ok: true } | { ok: false; error: string }

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
 * El borrado lo hace la función eliminar_periodo_nomina en una sola
 * transacción, en el orden que imponen las llaves foráneas que apuntan a
 * sgrh_nomina_detalle: el banco de horas (dos veces), las comisiones, los
 * comprobantes y las tres tablas de líneas.
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
    const resueltas = await filasConHorasDeBancoResueltas(supabase, ndtIds)
    if (!resueltas.ok) {
      return { ok: false, error: 'No se pudo revisar el banco de horas del periodo.' }
    }
    if (resueltas.ndtIds.length > 0) {
      return {
        ok: false,
        error: `No se puede eliminar el periodo: ${resueltas.ndtIds.length} empleado(s) tienen horas extra de esta quincena que ya se pagaron o compensaron desde el banco de horas. Borrar el periodo borraría ese registro. Revertí esos movimientos primero.`,
      }
    }
  }

  // Todo el borrado (banco de horas, comisiones, comprobantes, líneas, filas
  // y el periodo) en una sola transacción: o se borra todo o nada (auditoría,
  // riesgo "borrado sin transacción"). La función repite las validaciones de
  // arriba por si algo cambió entre la lectura y el borrado.
  const { error: errBorrado } = await supabase.rpc('eliminar_periodo_nomina', {
    p_npe_id: periodoId,
  })
  if (errBorrado) {
    // Estos códigos traen un mensaje escrito para la pantalla.
    if (['23514', '42501', 'P0002'].includes(errBorrado.code)) {
      return { ok: false, error: errBorrado.message }
    }
    console.error('deletePeriodo: error al borrar el periodo', errBorrado)
    return { ok: false, error: 'No se pudo eliminar el periodo.' }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${periodoId}`)
  revalidatePath('/payroll/banco-horas')
  return { ok: true }
}
