'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { aplicarHorasExtraEnDetalle } from '@/modules/payroll/lib/horasExtraDetalle'

export type RevertirBancoHorasResult = { ok: true } | { ok: false; error: string }

interface MovimientoRow {
  bhm_id: number
  bhm_estado: string
  bhm_monto_pagado: number | null
  bhm_nomina_detalle_pago_id: number | null
}

interface DetallePagoRow {
  ndt_id: number
  ndt_pagado: boolean
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_salario_por_hora: number
  ndt_nomina_periodo_id: number
  sgrh_nomina_periodo: { npe_estado: string } | null
}

/**
 * Devuelve al banco un movimiento ya resuelto: vuelve a quedar 'pendiente' y,
 * si se había pagado, el monto sale del periodo donde se había metido.
 *
 * Es el arrepentimiento antes de pagar. Sin esto, marcar por error el pago de
 * unas horas extra no tenía vuelta atrás: las horas quedaban como "pagadas"
 * para siempre y el monto adentro de una quincena que todavía no se había
 * desembolsado.
 *
 * Hay dos candados, y los dos son sobre el PERIODO DESTINO, no sobre el
 * movimiento:
 *
 *  - Si a ese empleado ya se le marcó el pago de esa quincena, sacarle el
 *    monto por detrás cambiaría un pago que ya se hizo, con su comprobante
 *    emitido y su aguinaldo acumulado. Primero hay que desmarcar el pago.
 *  - Si el periodo ya no está en borrador, es historia y no se toca.
 *
 * Un movimiento 'compensado' no movió plata, así que vuelve a pendiente sin
 * tocar ninguna planilla.
 */
export async function revertirBancoHoras(bhmId: number): Promise<RevertirBancoHorasResult> {
  if (!Number.isInteger(bhmId) || bhmId <= 0) {
    return { ok: false, error: 'Movimiento inválido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: movimiento, error: errMovimiento } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .select('bhm_id, bhm_estado, bhm_monto_pagado, bhm_nomina_detalle_pago_id')
    .eq('bhm_id', bhmId)
    .maybeSingle<MovimientoRow>()

  if (errMovimiento) {
    return { ok: false, error: 'No se pudo cargar el movimiento del banco de horas.' }
  }
  if (!movimiento) {
    return { ok: false, error: 'El movimiento no existe o no es visible.' }
  }
  if (movimiento.bhm_estado === 'pendiente') {
    return { ok: false, error: 'Estas horas ya están pendientes en el banco.' }
  }

  let periodoAfectado: number | null = null

  // Solo un movimiento PAGADO movió plata. Uno compensado no tocó ninguna
  // planilla, así que no hay nada que devolver.
  if (movimiento.bhm_estado === 'pagado') {
    if (!movimiento.bhm_nomina_detalle_pago_id) {
      return {
        ok: false,
        error:
          'Este movimiento figura como pagado pero no dice en qué periodo. Revisalo a mano antes de revertirlo.',
      }
    }

    const { data: detalle, error: errDetalle } = await supabase
      .from('sgrh_nomina_detalle')
      .select(
        `
        ndt_id,
        ndt_pagado,
        ndt_horas_ordinarias_diurnas,
        ndt_horas_extra_al_50,
        ndt_salario_por_hora,
        ndt_nomina_periodo_id,
        sgrh_nomina_periodo ( npe_estado )
      `
      )
      .eq('ndt_id', movimiento.bhm_nomina_detalle_pago_id)
      .maybeSingle<DetallePagoRow>()

    if (errDetalle) {
      return { ok: false, error: 'No se pudo cargar el periodo donde se pagaron estas horas.' }
    }
    if (!detalle) {
      return {
        ok: false,
        error: 'El periodo donde se pagaron estas horas ya no existe o no es visible.',
      }
    }
    if (detalle.ndt_pagado) {
      return {
        ok: false,
        error:
          'A este empleado ya se le marcó el pago de la quincena donde están estas horas. Desmarcá ese pago primero y volvé a intentarlo.',
      }
    }
    if (detalle.sgrh_nomina_periodo?.npe_estado !== 'borrador') {
      return {
        ok: false,
        error:
          'La quincena donde se pagaron estas horas ya no está en borrador, así que no se puede modificar.',
      }
    }

    const { error: errAplicar } = await aplicarHorasExtraEnDetalle(
      supabase,
      detalle,
      -(movimiento.bhm_monto_pagado ?? 0)
    )
    if (errAplicar) {
      return { ok: false, error: errAplicar }
    }

    periodoAfectado = detalle.ndt_nomina_periodo_id
  }

  // Se limpia todo lo que describía la resolución: dejar el monto o el
  // usuario de un pago que ya no existe es peor que no tenerlos.
  const { error: errRevertir } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .update({
      bhm_estado: 'pendiente',
      bhm_monto_pagado: null,
      bhm_nomina_detalle_pago_id: null,
      bhm_resuelto_por_id: null,
      bhm_fecha_resolucion: null,
    })
    .eq('bhm_id', bhmId)

  if (errRevertir) {
    return {
      ok: false,
      error:
        'Se sacó el monto de la planilla, pero no se pudo devolver el movimiento a pendiente. Avisá para revisarlo a mano.',
    }
  }

  revalidatePath('/payroll')
  revalidatePath('/payroll/banco-horas')
  if (periodoAfectado) revalidatePath(`/payroll/${periodoAfectado}`)
  return { ok: true }
}
