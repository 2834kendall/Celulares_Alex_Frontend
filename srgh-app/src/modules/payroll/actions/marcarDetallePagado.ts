'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { anioCicloAguinaldo } from '@/modules/payroll/lib/liquidacion'
import { hoyLocal } from '@/modules/payroll/lib/fechas'
import { generarCodigoVerificacion } from '@/modules/payroll/lib/comprobante'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'
import { MENSAJE_PROBLEMA } from '@/modules/payroll/lib/horasPeriodo'
import { formatDate } from '@/modules/payroll/lib/format'

interface DetalleActualRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  ndt_pagado: boolean
  ndt_historial_laboral_id: number
  ndt_salario_bruto: number
  sgrh_nomina_periodo: {
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_fecha_inicio_periodo: string | null
    npe_fecha_fin_periodo: string | null
  } | null
}

export type MarcarDetallePagadoResult = { ok: true } | { ok: false; error: string }

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

const INTENTOS_CODIGO_COMPROBANTE = 3

/**
 * Crea (o retira) el comprobante de pago del empleado en
 * sgrh_comprobantes_pago.
 *
 * La tabla existía desde el baseline —con índice único, RLS y una columna
 * para que el empleado confirme el recibo— pero nadie la escribía: el
 * comprobante se armaba al vuelo desde el detalle y no quedaba ninguna
 * evidencia de que el pago se hizo. Ahora marcar el pago deja esa fila, con
 * un código de verificación que va impreso en el comprobante.
 *
 * Al DESMARCAR se borra la fila: el pago no ocurrió, y dejar vivo un código
 * de verificación de un pago inexistente es peor que no tenerlo. El periodo
 * sigue en borrador en ese momento, así que todavía no es historia.
 *
 * Es "mejor esfuerzo", igual que la provisión de aguinaldo: si falla, no
 * bloquea el marcado que ya se guardó.
 */
async function sincronizarComprobante(
  supabase: SupabaseServerClient,
  ndtId: number,
  pagado: boolean
): Promise<void> {
  if (!pagado) {
    await supabase.from('sgrh_comprobantes_pago').delete().eq('com_nomina_detalle_id', ndtId)
    return
  }

  const { data: existente } = await supabase
    .from('sgrh_comprobantes_pago')
    .select('com_id')
    .eq('com_nomina_detalle_id', ndtId)
    .maybeSingle<{ com_id: number }>()

  // Ya tiene comprobante (se desmarcó y se volvió a marcar sin que la
  // eliminación llegara a correr): no se emite otro código para el mismo pago.
  if (existente) return

  for (let intento = 0; intento < INTENTOS_CODIGO_COMPROBANTE; intento += 1) {
    const { error } = await supabase.from('sgrh_comprobantes_pago').insert({
      com_nomina_detalle_id: ndtId,
      com_codigo_verificacion: generarCodigoVerificacion(),
    })

    if (!error) return
    // 23505 = choque con el índice único del código. Cualquier otro error no
    // se arregla reintentando.
    if (error.code !== '23505') return
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
      sgrh_nomina_periodo (
        npe_periodo_mes, npe_periodo_anio,
        npe_fecha_inicio_periodo, npe_fecha_fin_periodo
      )
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

  // Antes de dar por pagado a alguien, sus marcas del periodo tienen que
  // estar completas. Un dia con entrada y sin salida no suma horas, asi que
  // el monto calculado esta corto: pagarlo es pagarle de menos a la persona
  // por un fallo del kiosco o un olvido, y una vez marcado el periodo se cierra
  // y el error queda enterrado.
  //
  // Solo se revisa al MARCAR. Desmarcar siempre se puede: es la salida cuando
  // algo quedo mal.
  const periodo = detalle.sgrh_nomina_periodo
  if (pagado && periodo?.npe_fecha_inicio_periodo && periodo.npe_fecha_fin_periodo) {
    const horas = await getHorasDelPeriodo(supabase, {
      historialLaboralIds: [detalle.ndt_historial_laboral_id],
      fechaInicio: periodo.npe_fecha_inicio_periodo,
      fechaFin: periodo.npe_fecha_fin_periodo,
    })

    const problemas = horas.ok
      ? (horas.data.get(detalle.ndt_historial_laboral_id)?.diasConProblema ?? [])
      : []

    if (problemas.length > 0) {
      const detalleDias = problemas
        .slice(0, 3)
        .map((d) => `${formatDate(d.fecha)} (${MENSAJE_PROBLEMA[d.problema]})`)
        .join(' · ')
      const resto = problemas.length > 3 ? ` y ${problemas.length - 3} día(s) más` : ''

      return {
        ok: false,
        error: `Este empleado tiene marcas de asistencia incompletas en el periodo, así que las horas calculadas están cortas: ${detalleDias}${resto}. Corregí las marcas en Asistencia antes de marcar el pago.`,
      }
    }
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
  if (detalle.ndt_pagado !== pagado) {
    await sincronizarComprobante(supabase, ndtId, pagado)
  }

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
