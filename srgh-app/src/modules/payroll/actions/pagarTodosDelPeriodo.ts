'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ERROR_FILTRO_MARCA, getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { FILAS_EN_PARALELO, mapConLimite } from '@/modules/payroll/lib/concurrencia'
import { liquidacionesQueCubren } from '@/modules/payroll/lib/liquidacionData'
import { sincronizarEstadoPeriodo } from '@/modules/payroll/lib/estadoPeriodoData'
import { marcarDetallePagado } from '@/modules/payroll/actions/marcarDetallePagado'

export type PagarTodosResult =
  | {
      ok: true
      /** Filas que quedaron pagadas en esta pasada. */
      pagados: number
      /** Las que no se pudieron pagar, con el motivo que dio el pago individual. */
      noPagados: { nombre: string; motivo: string }[]
      /** Filas que no se pagan por planilla: su salario va en una liquidación. */
      enLiquidacion: number
      /** De las pagadas, a cuántas no se les pudo mandar el comprobante por correo. */
      correosNoEnviados: number
    }
  | { ok: false; error: string }

interface FilaPendienteRow {
  ndt_id: number
  ndt_historial_laboral_id: number
  ndt_sucursal_id: number
  sgrh_historial_laboral: {
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
      emp_apellido_2: string | null
    } | null
  } | null
}

interface PeriodoRow {
  npe_id: number
  npe_sucursal_id: number | null
  npe_periodo_anio: number
  npe_periodo_mes: number
  npe_quincena: number
}

/**
 * Marca como pagadas todas las filas sin pagar del periodo que la cuenta ve.
 *
 * No hay un camino aparte para pagar en bloque: cada fila pasa por
 * marcarDetallePagado, con todas sus revisiones (marcas incompletas, horas
 * desactualizadas, fila en ₡0, contrato liquidado…), su comprobante, su
 * aguinaldo acumulado y su correo. Una fila que no pasa no frena a las demás:
 * queda sin pagar y vuelve en `noPagados` con el mismo motivo que daría el
 * botón de su fila.
 *
 * Qué filas: las que muestra la pantalla del periodo. La RLS ya deja ver solo
 * las de las sucursales de la cuenta; en un periodo de toda la empresa se
 * respeta además la marca elegida en el selector y, si viene, la sucursal del
 * filtro de la pantalla. Las filas cuyo salario va en una liquidación no se
 * pagan por planilla: se cuentan aparte.
 *
 * Se puede repetir sin riesgo: una fila ya pagada no vuelve a entrar.
 */
export async function pagarTodosDelPeriodo(
  periodoId: number,
  sucursalId: number | null = null
): Promise<PagarTodosResult> {
  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return { ok: false, error: 'Periodo inválido.' }
  }
  if (sucursalId !== null && (!Number.isInteger(sucursalId) || sucursalId <= 0)) {
    return { ok: false, error: 'Sucursal inválida.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const [{ data: periodo, error: errPeriodo }, { data: pendientes, error: errFilas }] =
    await Promise.all([
      supabase
        .from('sgrh_nomina_periodo')
        .select('npe_id, npe_sucursal_id, npe_periodo_anio, npe_periodo_mes, npe_quincena')
        .eq('npe_id', periodoId)
        .maybeSingle<PeriodoRow>(),
      supabase
        .from('sgrh_nomina_detalle')
        .select(
          `
          ndt_id,
          ndt_historial_laboral_id,
          ndt_sucursal_id,
          sgrh_historial_laboral ( sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2 ) )
        `
        )
        .eq('ndt_nomina_periodo_id', periodoId)
        .eq('ndt_pagado', false)
        .order('ndt_id', { ascending: true })
        .returns<FilaPendienteRow[]>(),
    ])

  if (errPeriodo) {
    return { ok: false, error: 'No se pudo cargar el periodo.' }
  }
  if (!periodo) {
    return { ok: false, error: 'El periodo no existe o no es visible.' }
  }
  if (errFilas) {
    return { ok: false, error: 'No se pudo cargar la planilla del periodo.' }
  }

  let filas = Array.isArray(pendientes) ? pendientes : []
  if (periodo.npe_sucursal_id === null) {
    const filtro = await getFiltroMarca()
    if (filtro.estado === 'error') return { ok: false, error: ERROR_FILTRO_MARCA }
    if (filtro.estado === 'filtrado') {
      const deLaMarca = new Set(filtro.sucursalIds)
      filas = filas.filter((f) => deLaMarca.has(f.ndt_sucursal_id))
    }
  }
  if (sucursalId !== null) {
    filas = filas.filter((f) => f.ndt_sucursal_id === sucursalId)
  }

  if (filas.length === 0) {
    return { ok: true, pagados: 0, noPagados: [], enLiquidacion: 0, correosNoEnviados: 0 }
  }

  // Las que ya paga una liquidación no se intentan: marcarDetallePagado las
  // rechazaría una por una y no son un pago que haya fallado.
  const cubiertas = await liquidacionesQueCubren(
    supabase,
    filas.map((f) => f.ndt_historial_laboral_id),
    {
      anio: periodo.npe_periodo_anio,
      mes: periodo.npe_periodo_mes,
      quincena: periodo.npe_quincena,
    }
  )
  if (!cubiertas.ok) {
    return { ok: false, error: 'No se pudo verificar las liquidaciones de los empleados.' }
  }
  const porPagar = filas.filter((f) => !cubiertas.data.has(f.ndt_historial_laboral_id))
  const enLiquidacion = filas.length - porPagar.length

  const nombreDe = (f: FilaPendienteRow) => {
    const e = f.sgrh_historial_laboral?.sgrh_empleados
    return e
      ? [e.emp_nombre, e.emp_apellido_1, e.emp_apellido_2].filter(Boolean).join(' ')
      : `contrato ${f.ndt_historial_laboral_id}`
  }

  // Cada fila toca solo lo suyo (su detalle, su comprobante y la provisión de
  // aguinaldo de su contrato), así que van de a varias a la vez.
  const resultados = await mapConLimite(porPagar, FILAS_EN_PARALELO, async (fila) => {
    try {
      return await marcarDetallePagado(fila.ndt_id, true)
    } catch (error) {
      console.error('pagarTodosDelPeriodo: fallo inesperado al pagar una fila', error)
      return { ok: false as const, error: 'Ocurrió un error inesperado al pagar esta fila.' }
    }
  })

  let pagados = 0
  let correosNoEnviados = 0
  const noPagados: { nombre: string; motivo: string }[] = []
  resultados.forEach((resultado, i) => {
    if (!resultado.ok) {
      noPagados.push({ nombre: nombreDe(porPagar[i]), motivo: resultado.error })
      return
    }
    pagados += 1
    if (resultado.correo?.estado === 'error') correosNoEnviados += 1
  })

  // Cada pago recalcula el estado del periodo al terminar, pero con varios a
  // la vez el último en escribir pudo haber leído antes de que otro
  // terminara. Una vez más, ya con todo guardado.
  if (pagados > 0) {
    await sincronizarEstadoPeriodo(supabase, periodoId)
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${periodoId}`)
  revalidatePath('/payroll/aguinaldo-liquidacion')

  return { ok: true, pagados, noPagados, enLiquidacion, correosNoEnviados }
}
