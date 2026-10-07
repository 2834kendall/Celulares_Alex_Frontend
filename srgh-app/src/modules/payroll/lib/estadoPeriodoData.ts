/**
 * Estado guardado del periodo ('borrador' / 'pagado'), recalculado a partir
 * de sus filas. Lo usan marcarDetallePagado (al marcar o desmarcar un pago) y
 * procesarLiquidacion (al liquidar a alguien con la quincena de salida sin
 * pagar).
 *
 * Solo servidor.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { hoyLocal } from '@/modules/payroll/lib/fechas'
import { liquidacionesQueCubren } from '@/modules/payroll/lib/liquidacionData'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface FilaEstadoRow {
  ndt_historial_laboral_id: number
  ndt_pagado: boolean
  ndt_fecha_pago: string | null
}

interface PeriodoRefRow {
  npe_periodo_anio: number
  npe_periodo_mes: number
  npe_quincena: number
}

/**
 * Una fila cuenta como resuelta si está pagada por planilla, o si su salario
 * ya va en una liquidación como salario pendiente (liquidacionesQueCubren).
 * Esa segunda fila no se puede pagar por planilla (sería pagarla dos veces:
 * marcarDetallePagado la frena), así que sin contarla el periodo se quedaba
 * en 'borrador' para siempre.
 *
 * Con TODAS resueltas y al menos UNA pagada por planilla, el periodo pasa a
 * 'pagado', con npe_fecha_pago = el pago por planilla más reciente. Si falta
 * alguna, vuelve a 'borrador'.
 *
 * Por qué hace falta una pagada por planilla: un periodo 'pagado' ya no deja
 * cargar empleados, subir Excel ni editar filas, y la única forma de volver a
 * abrirlo es desmarcar un pago. Si todas sus filas fueran de liquidaciones no
 * habría ningún pago que desmarcar y el periodo quedaría trabado. Por la misma
 * razón un periodo sin filas nunca pasa a 'pagado' solo.
 *
 * Si no se puede leer el periodo o las liquidaciones, la fila impaga cuenta
 * como pendiente: ante la duda el periodo queda abierto, nunca cerrado de
 * más. Es mejor esfuerzo: no lanza.
 */
export async function sincronizarEstadoPeriodo(
  supabase: SupabaseServerClient,
  periodoId: number
): Promise<void> {
  const [{ data: filas }, { data: periodo }] = await Promise.all([
    supabase
      .from('sgrh_nomina_detalle')
      .select('ndt_historial_laboral_id, ndt_pagado, ndt_fecha_pago')
      .eq('ndt_nomina_periodo_id', periodoId)
      .returns<FilaEstadoRow[]>(),
    supabase
      .from('sgrh_nomina_periodo')
      .select('npe_periodo_anio, npe_periodo_mes, npe_quincena')
      .eq('npe_id', periodoId)
      .maybeSingle<PeriodoRefRow>(),
  ])

  const lista = Array.isArray(filas) ? filas : []
  const impagas = lista.filter((f) => !f.ndt_pagado)

  let cubiertas = new Set<number>()
  if (impagas.length > 0 && periodo) {
    try {
      const resultado = await liquidacionesQueCubren(
        supabase,
        impagas.map((f) => f.ndt_historial_laboral_id),
        {
          anio: periodo.npe_periodo_anio,
          mes: periodo.npe_periodo_mes,
          quincena: periodo.npe_quincena,
        }
      )
      if (resultado.ok) cubiertas = new Set(resultado.data.keys())
    } catch (err) {
      console.error('sincronizarEstadoPeriodo: no se pudieron leer las liquidaciones', err)
    }
  }

  const todasResueltas =
    lista.some((f) => f.ndt_pagado) &&
    lista.every((f) => f.ndt_pagado || cubiertas.has(f.ndt_historial_laboral_id))

  if (todasResueltas) {
    // Hay al menos una pagada; hoy solo si ninguna guardó su fecha de pago.
    const fechaPago =
      lista.reduce<string | null>((max, f) => {
        if (!f.ndt_pagado || !f.ndt_fecha_pago) return max
        return !max || f.ndt_fecha_pago > max ? f.ndt_fecha_pago : max
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

interface FilaImpagaRow {
  ndt_nomina_periodo_id: number
  sgrh_nomina_periodo: { npe_periodo_anio: number; npe_periodo_mes: number } | null
}

/**
 * Después de liquidar: los periodos del mes de salida donde quedó una fila
 * impaga de la relación laboral se recalculan, así el que ya tenía a todos
 * los demás pagados pasa a 'pagado' sin que nadie tenga que tocarlo. Mejor
 * esfuerzo: un fallo acá no deshace la liquidación ya guardada.
 */
export async function sincronizarPeriodosDeLaSalida(
  supabase: SupabaseServerClient,
  labIds: number[],
  fechaSalida: string
): Promise<void> {
  if (labIds.length === 0) return
  const anio = Number(fechaSalida.slice(0, 4))
  const mes = Number(fechaSalida.slice(5, 7))

  const { data, error } = await supabase
    .from('sgrh_nomina_detalle')
    .select('ndt_nomina_periodo_id, sgrh_nomina_periodo ( npe_periodo_anio, npe_periodo_mes )')
    .in('ndt_historial_laboral_id', labIds)
    .eq('ndt_pagado', false)
    .returns<FilaImpagaRow[]>()
  if (error || !Array.isArray(data)) return

  const periodos = new Set(
    data
      .filter(
        (f) =>
          f.sgrh_nomina_periodo?.npe_periodo_anio === anio &&
          f.sgrh_nomina_periodo?.npe_periodo_mes === mes
      )
      .map((f) => f.ndt_nomina_periodo_id)
  )
  for (const periodoId of periodos) {
    await sincronizarEstadoPeriodo(supabase, periodoId)
  }
}
