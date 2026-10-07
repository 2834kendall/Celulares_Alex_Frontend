'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { aplicarHorasExtraEnDetalle } from '@/modules/payroll/lib/horasExtraDetalle'
import { periodoLabel } from '@/modules/payroll/lib/format'
import { ahoraLocal } from '@/modules/payroll/lib/fechas'
import { liquidacionesQueCubren } from '@/modules/payroll/lib/liquidacionData'
import {
  pagarBancoHorasSchema,
  type PagarBancoHorasInput,
  type PagarBancoHorasResult,
} from '@/modules/payroll/types'

interface MovimientoRow {
  bhm_id: number
  bhm_historial_laboral_id: number
  bhm_estado: string
}

interface DetalleBorradorRow {
  ndt_id: number
  ndt_pagado: boolean
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_salario_por_hora: number
  ndt_nomina_periodo_id: number
  sgrh_nomina_periodo: {
    npe_estado: string
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_quincena: number
    npe_fecha_inicio_periodo: string | null
  } | null
}

/**
 * Paga un movimiento pendiente del banco de horas: agrega el monto como
 * ingreso al periodo en borrador más reciente del empleado, usando el mismo
 * motor de cálculo dinámico de la edición manual (así el CCSS se recalcula
 * sobre el nuevo bruto, igual que cualquier otro ingreso).
 *
 * El concepto HORAS_EXTRA está desactivado en el catálogo (ya no es una
 * columna editable en Excel/edición manual — ver sgrh_banco_horas.sql), pero
 * su fila del catálogo se sigue usando aquí, forzada a "monto manual
 * ingreso" solo para esta operación puntual.
 */
export async function pagarBancoHoras(input: PagarBancoHorasInput): Promise<PagarBancoHorasResult> {
  const parsed = pagarBancoHorasSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const usuarioId = (claims.app_metadata as { usr_id?: number })?.usr_id ?? null
  const supabase = await createClient()

  const { data: movimiento, error: errMovimiento } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .select('bhm_id, bhm_historial_laboral_id, bhm_estado')
    .eq('bhm_id', parsed.data.bhmId)
    .maybeSingle<MovimientoRow>()

  if (errMovimiento) {
    return { ok: false, error: 'No se pudo cargar el movimiento del banco de horas.' }
  }
  if (!movimiento) {
    return { ok: false, error: 'El movimiento no existe o no es visible.' }
  }
  if (movimiento.bhm_estado !== 'pendiente') {
    return { ok: false, error: 'Este movimiento ya fue resuelto (pagado o compensado).' }
  }

  // Periodo en borrador más reciente del empleado, donde se va a aplicar el pago.
  const { data: detalles, error: errDetalles } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `
      ndt_id,
      ndt_pagado,
      ndt_horas_ordinarias_diurnas,
      ndt_horas_extra_al_50,
      ndt_salario_por_hora,
      ndt_nomina_periodo_id,
      sgrh_nomina_periodo (
        npe_estado, npe_periodo_mes, npe_periodo_anio, npe_quincena, npe_fecha_inicio_periodo
      )
    `
    )
    .eq('ndt_historial_laboral_id', movimiento.bhm_historial_laboral_id)
    .returns<DetalleBorradorRow[]>()

  if (errDetalles) {
    return { ok: false, error: 'No se pudo cargar la planilla del empleado.' }
  }

  // Solo una fila que todavía se va a pagar por planilla. Un periodo sigue en
  // 'borrador' mientras le falte alguien, así que puede tener filas ya
  // pagadas: sumarle las horas a una de esas cambiaba un comprobante emitido
  // por plata que nunca se transfería. Lo mismo con una fila cuyo salario ya
  // va en una liquidación: no se puede marcar pagada, y el monto se perdía.
  const abiertas = (detalles ?? [])
    .filter((d) => d.sgrh_nomina_periodo?.npe_estado === 'borrador' && !d.ndt_pagado)
    .sort((a, b) =>
      (b.sgrh_nomina_periodo?.npe_fecha_inicio_periodo ?? '').localeCompare(
        a.sgrh_nomina_periodo?.npe_fecha_inicio_periodo ?? ''
      )
    )

  let detalleDestino: DetalleBorradorRow | undefined
  for (const candidato of abiertas) {
    const periodo = candidato.sgrh_nomina_periodo!
    const cubiertas = await liquidacionesQueCubren(
      supabase,
      [movimiento.bhm_historial_laboral_id],
      {
        anio: periodo.npe_periodo_anio,
        mes: periodo.npe_periodo_mes,
        quincena: periodo.npe_quincena,
      }
    )
    if (!cubiertas.ok) {
      return { ok: false, error: 'No se pudo verificar si el empleado ya fue liquidado.' }
    }
    if (!cubiertas.data.has(movimiento.bhm_historial_laboral_id)) {
      detalleDestino = candidato
      break
    }
  }

  if (!detalleDestino) {
    return {
      ok: false,
      error:
        'Este empleado no tiene ninguna quincena sin pagar en un periodo abierto. Creá o abrí un periodo donde todavía no se le haya pagado antes de pagarle estas horas.',
    }
  }

  // Primero se RESERVA el movimiento: pasa a 'pagado' solo si sigue
  // 'pendiente'. Antes se sumaba el monto a la planilla y recién después se
  // marcaba, sin volver a mirar el estado: dos personas pagando el mismo
  // movimiento a la vez sumaban las horas extra dos veces.
  const { data: reservado, error: errResolver } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .update({
      bhm_estado: 'pagado',
      bhm_monto_pagado: parsed.data.monto,
      bhm_nomina_detalle_pago_id: detalleDestino.ndt_id,
      // La columna existía y nunca se escribía: no quedaba quién había
      // resuelto el movimiento.
      bhm_resuelto_por_id: usuarioId,
      // ahoraLocal y no toISOString: la columna es `timestamp without time
      // zone`, así que guarda la hora tal cual se la manda. Con toISOString en
      // Costa Rica (UTC-6) todo quedaba seis horas adelantado.
      bhm_fecha_resolucion: ahoraLocal(),
    })
    .eq('bhm_id', parsed.data.bhmId)
    .eq('bhm_estado', 'pendiente')
    .select('bhm_id')
    .returns<{ bhm_id: number }[]>()
  if (errResolver) {
    return { ok: false, error: 'No se pudo marcar el movimiento como pagado. No se pagó nada.' }
  }
  if (!reservado || reservado.length === 0) {
    return { ok: false, error: 'Este movimiento ya fue resuelto (pagado o compensado).' }
  }

  // Sumar el monto al detalle destino y recalcular la fila entera. Lo
  // comparte con revertirBancoHoras, que hace lo mismo con signo contrario.
  const { error: errAplicar, aMedias } = await aplicarHorasExtraEnDetalle(
    supabase,
    detalleDestino,
    parsed.data.monto
  )
  if (errAplicar && aMedias) {
    // Los montos de la fila ya se escribieron y las líneas no: el movimiento
    // queda pagado apuntando a esa fila. Devolverlo a pendiente dejaba que un
    // reintento sumara el monto otra vez sobre lo que ya había entrado.
    return {
      ok: false,
      error: `${errAplicar} El pago quedó a medias en la planilla de ${periodoLabel(
        detalleDestino.sgrh_nomina_periodo!.npe_periodo_mes,
        detalleDestino.sgrh_nomina_periodo!.npe_periodo_anio,
        detalleDestino.sgrh_nomina_periodo!.npe_quincena
      )}: el movimiento se dejó como pagado para que no se sume dos veces. Revisá ese detalle antes de seguir.`,
    }
  }
  if (errAplicar) {
    // No llegó a la planilla: el movimiento vuelve a quedar pendiente.
    const { error: errDeshacer } = await supabase
      .from('sgrh_banco_horas_movimientos')
      .update({
        bhm_estado: 'pendiente',
        bhm_monto_pagado: null,
        bhm_nomina_detalle_pago_id: null,
        bhm_resuelto_por_id: null,
        bhm_fecha_resolucion: null,
      })
      .eq('bhm_id', parsed.data.bhmId)
    if (errDeshacer) {
      return {
        ok: false,
        error: `${errAplicar} Además el movimiento quedó marcado como pagado sin estarlo: avisá para revisarlo a mano.`,
      }
    }
    return { ok: false, error: errAplicar }
  }

  const label = periodoLabel(
    detalleDestino.sgrh_nomina_periodo!.npe_periodo_mes,
    detalleDestino.sgrh_nomina_periodo!.npe_periodo_anio,
    detalleDestino.sgrh_nomina_periodo!.npe_quincena
  )

  revalidatePath('/payroll')
  revalidatePath('/payroll/banco-horas')
  revalidatePath(`/payroll/${detalleDestino.ndt_nomina_periodo_id}`)
  return { ok: true, periodoLabel: label }
}
