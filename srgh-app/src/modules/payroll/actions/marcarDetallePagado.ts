'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { anioCicloAguinaldo } from '@/modules/payroll/lib/liquidacion'

interface DetalleActualRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  ndt_pagado: boolean
  ndt_historial_laboral_id: number
  ndt_salario_bruto: number
  sgrh_nomina_periodo: { npe_periodo_mes: number; npe_periodo_anio: number } | null
}

export type MarcarDetallePagadoResult = { ok: true } | { ok: false; error: string }

/** 'YYYY-MM-DD' en horario local, sin pasar por Date→ISOString (evita el corrimiento UTC). */
function hoyLocal(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Suma (o resta, si se desmarca un pago) la parte proporcional del aguinaldo
 * de este período — salario bruto ÷ 12 — a la provisión anual del empleado
 * (sgrh_provisiones_anuales.pra_monto_acumulado_aguinaldo). El ciclo de
 * aguinaldo va de diciembre a noviembre; diciembre abre el ciclo del año
 * siguiente (ver anioCicloAguinaldo).
 *
 * Es "mejor esfuerzo": si falla, no bloquea el marcado de pago (que ya se
 * guardó en sgrh_nomina_detalle), pero el acumulado de aguinaldo puede
 * quedar desactualizado para ese empleado y habría que revisarlo a mano.
 */
async function acumularProvisionAguinaldo(
  supabase: SupabaseServerClient,
  historialLaboralId: number,
  mesPeriodo: number,
  anioPeriodo: number,
  salarioBruto: number,
  signo: 1 | -1
): Promise<void> {
  const anio = anioCicloAguinaldo(mesPeriodo, anioPeriodo)
  const delta = (salarioBruto / 12) * signo

  const { data: existente } = await supabase
    .from('sgrh_provisiones_anuales')
    .select('pra_id, pra_monto_acumulado_aguinaldo')
    .eq('pra_historial_laboral_id', historialLaboralId)
    .eq('pra_anio', anio)
    .maybeSingle<{ pra_id: number; pra_monto_acumulado_aguinaldo: number }>()

  if (existente) {
    await supabase
      .from('sgrh_provisiones_anuales')
      .update({
        pra_monto_acumulado_aguinaldo: Math.max(0, existente.pra_monto_acumulado_aguinaldo + delta),
      })
      .eq('pra_id', existente.pra_id)
    return
  }

  // No crear una fila nueva solo para restar (desmarcar un pago que nunca
  // llegó a acumular nada, por ejemplo si la fila se creó después).
  if (delta > 0) {
    await supabase.from('sgrh_provisiones_anuales').insert({
      pra_historial_laboral_id: historialLaboralId,
      pra_anio: anio,
      pra_monto_acumulado_aguinaldo: delta,
    })
  }
}

interface DetallePagadoRow {
  ndt_pagado: boolean
  ndt_fecha_pago: string | null
}

/**
 * Recalcula el estado del periodo a partir de sus propios empleados: si
 * TODOS están marcados como pagados, el periodo pasa a 'pagado' (con
 * npe_fecha_pago = la fecha de pago más reciente entre los empleados). Si
 * falta alguno, vuelve a 'borrador'. Un periodo sin empleados nunca pasa a
 * 'pagado' solo. Es mejor esfuerzo: si falla, no bloquea el marcado
 * individual que ya se guardó.
 */
async function sincronizarEstadoPeriodo(
  supabase: SupabaseServerClient,
  periodoId: number
): Promise<void> {
  const { data: detalles } = await supabase
    .from('sgrh_nomina_detalle')
    .select('ndt_pagado, ndt_fecha_pago')
    .eq('ndt_nomina_periodo_id', periodoId)
    .returns<DetallePagadoRow[]>()

  const lista = detalles ?? []
  const todosPagados = lista.length > 0 && lista.every((d) => d.ndt_pagado)

  if (todosPagados) {
    const fechaPago =
      lista.reduce<string | null>((max, d) => {
        if (!d.ndt_fecha_pago) return max
        return !max || d.ndt_fecha_pago > max ? d.ndt_fecha_pago : max
      }, null) ?? hoyLocal()

    await supabase
      .from('sgrh_nomina_periodo')
      .update({ npe_estado: 'pagado', npe_fecha_pago: fechaPago })
      .eq('npe_id', periodoId)
  } else {
    await supabase
      .from('sgrh_nomina_periodo')
      .update({ npe_estado: 'borrador', npe_fecha_pago: null })
      .eq('npe_id', periodoId)
  }
}

/**
 * Marca (o desmarca) el pago de un empleado dentro de un periodo
 * (ndt_pagado). Después de guardarlo, recalcula el estado del periodo
 * completo (npe_estado): pasa solo a 'pagado' cuando TODOS sus empleados
 * quedan pagados, y vuelve a 'borrador' si se desmarca alguno — así el
 * estado del periodo siempre refleja lo que realmente se pagó, sin
 * necesidad de un botón aparte. Al marcarlo, también acumula la parte
 * proporcional de aguinaldo de este período en la provisión anual del
 * empleado.
 */
export async function marcarDetallePagado(
  ndtId: number,
  pagado: boolean
): Promise<MarcarDetallePagadoResult> {
  if (!Number.isInteger(ndtId) || ndtId <= 0) {
    return { ok: false, error: 'Detalle inválido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: detalle, error: errDetalle } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `
      ndt_id,
      ndt_nomina_periodo_id,
      ndt_pagado,
      ndt_historial_laboral_id,
      ndt_salario_bruto,
      sgrh_nomina_periodo ( npe_periodo_mes, npe_periodo_anio )
    `
    )
    .eq('ndt_id', ndtId)
    .maybeSingle<DetalleActualRow>()

  if (errDetalle) {
    return { ok: false, error: 'No se pudo cargar el detalle de la planilla.' }
  }
  if (!detalle) {
    return { ok: false, error: 'El detalle no existe o no es visible.' }
  }

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_pagado: pagado,
      ndt_fecha_pago: pagado ? hoyLocal() : null,
    })
    .eq('ndt_id', ndtId)

  if (errUpdate) {
    return { ok: false, error: 'No se pudo actualizar el estado de pago.' }
  }

  // Solo mover la provisión si el estado realmente cambió, para no duplicar
  // el acumulado si esto se llama dos veces con el mismo valor.
  if (detalle.ndt_pagado !== pagado && detalle.sgrh_nomina_periodo) {
    await acumularProvisionAguinaldo(
      supabase,
      detalle.ndt_historial_laboral_id,
      detalle.sgrh_nomina_periodo.npe_periodo_mes,
      detalle.sgrh_nomina_periodo.npe_periodo_anio,
      detalle.ndt_salario_bruto,
      pagado ? 1 : -1
    )
  }

  await sincronizarEstadoPeriodo(supabase, detalle.ndt_nomina_periodo_id)

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${detalle.ndt_nomina_periodo_id}`)
  revalidatePath('/payroll/aguinaldo-liquidacion')
  return { ok: true }
}
