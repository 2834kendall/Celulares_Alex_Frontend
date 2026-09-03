'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { calcularPlanillaPorConceptos, type ConceptoCalculo } from '@/modules/payroll/lib/planilla'
import { periodoLabel } from '@/modules/payroll/lib/format'
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
  ndt_horas_ordinarias_diurnas: number
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

interface LineaIngresoRow {
  ing_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string } | null
}

interface LineaDeduccionRow {
  ded_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string; con_tipo_calculo: string } | null
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

  await requirePermission(PERMISOS.NOMINA_WRITE)
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
      ndt_horas_ordinarias_diurnas,
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

  const enBorrador = (detalles ?? [])
    .filter((d) => d.sgrh_nomina_periodo?.npe_estado === 'borrador')
    .sort((a, b) =>
      (b.sgrh_nomina_periodo?.npe_fecha_inicio_periodo ?? '').localeCompare(
        a.sgrh_nomina_periodo?.npe_fecha_inicio_periodo ?? ''
      )
    )
  const detalleDestino = enBorrador[0]

  if (!detalleDestino) {
    return {
      ok: false,
      error:
        'Este empleado no tiene ningún periodo en borrador ahora mismo. Creá o abrí un periodo antes de pagarle estas horas.',
    }
  }

  // Conceptos activos (para recalcular todo el detalle) + HORAS_EXTRA del
  // catálogo (aunque esté inactivo), forzado a monto manual solo para esta operación.
  const [{ data: conceptosActivos, error: errConceptos }, { data: horasExtraConcepto }] =
    await Promise.all([
      supabase
        .from('sgrh_cat_conceptos_nomina')
        .select(
          'con_id, con_codigo, con_tipo, con_afecta_base_ccss, con_tipo_calculo, con_porcentaje'
        )
        .eq('con_activo', true)
        .returns<ConceptoCalculo[]>(),
      supabase
        .from('sgrh_cat_conceptos_nomina')
        .select(
          'con_id, con_codigo, con_tipo, con_afecta_base_ccss, con_tipo_calculo, con_porcentaje'
        )
        .eq('con_codigo', 'HORAS_EXTRA')
        .maybeSingle<ConceptoCalculo>(),
    ])

  if (errConceptos) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }
  if (!horasExtraConcepto) {
    return {
      ok: false,
      error:
        'No se encontró el concepto "HORAS_EXTRA" en el catálogo. Es necesario para registrar el pago.',
    }
  }

  const conceptosParaCalculo: ConceptoCalculo[] = [
    ...(conceptosActivos ?? []),
    { ...horasExtraConcepto, con_tipo_calculo: 'monto_manual_ingreso' },
  ]

  // Montos ya guardados en el periodo destino, para no perderlos al recalcular.
  //
  // Hay que leer las DOS tablas. Mas abajo se borran tanto las lineas de
  // ingreso como las de deduccion y se reinsertan desde lo que devuelva el
  // motor, asi que todo concepto manual que no llegue en `montos` desaparece.
  // Leyendo solo los ingresos, cualquier deduccion manual que el periodo ya
  // tuviera (prestamo, embargo, renta, cuota solidarista) se borraba en
  // silencio y el neto del empleado subia.
  const [
    { data: lineasIngresoActuales, error: errLineasIngreso },
    { data: lineasDeduccionActuales, error: errLineasDeduccion },
  ] = await Promise.all([
    supabase
      .from('sgrh_nomina_linea_ingreso')
      .select('ing_monto, sgrh_cat_conceptos_nomina ( con_codigo )')
      .eq('ing_nomina_detalle_id', detalleDestino.ndt_id)
      .returns<LineaIngresoRow[]>(),
    supabase
      .from('sgrh_nomina_linea_deduccion')
      .select('ded_monto, sgrh_cat_conceptos_nomina ( con_codigo, con_tipo_calculo )')
      .eq('ded_nomina_detalle_id', detalleDestino.ndt_id)
      .returns<LineaDeduccionRow[]>(),
  ])

  if (errLineasIngreso || errLineasDeduccion) {
    return { ok: false, error: 'No se pudo cargar el detalle del periodo destino.' }
  }

  const montos: Record<string, number> = {}
  for (const linea of lineasIngresoActuales ?? []) {
    const codigo = linea.sgrh_cat_conceptos_nomina?.con_codigo
    if (!codigo) continue
    montos[codigo] = linea.ing_monto
  }
  // Solo las deducciones de monto manual: las porcentuales (CCSS) las vuelve a
  // calcular el motor sobre el bruto nuevo, arrastrar su monto viejo seria un
  // error.
  for (const linea of lineasDeduccionActuales ?? []) {
    const concepto = linea.sgrh_cat_conceptos_nomina
    if (!concepto || concepto.con_tipo_calculo !== 'monto_manual_deduccion') continue
    montos[concepto.con_codigo] = linea.ded_monto
  }
  // Se suma al monto de HORAS_EXTRA que ya hubiera en ese periodo (por si se
  // le paga banco de horas más de una vez al mismo periodo en borrador).
  montos.HORAS_EXTRA = (montos.HORAS_EXTRA ?? 0) + parsed.data.monto

  const { salarioBruto, totalDeducciones, salarioNeto, lineas } = calcularPlanillaPorConceptos(
    conceptosParaCalculo,
    {
      montos,
      horasTrabajadas: detalleDestino.ndt_horas_ordinarias_diurnas,
      salarioPorHora: detalleDestino.ndt_salario_por_hora,
    }
  )

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_salario_bruto: salarioBruto,
      ndt_total_deducciones_obreras: totalDeducciones,
      ndt_salario_neto: salarioNeto,
    })
    .eq('ndt_id', detalleDestino.ndt_id)
  if (errUpdate) {
    return { ok: false, error: 'No se pudieron actualizar los montos del periodo destino.' }
  }

  const { error: errDelIngreso } = await supabase
    .from('sgrh_nomina_linea_ingreso')
    .delete()
    .eq('ing_nomina_detalle_id', detalleDestino.ndt_id)
  const { error: errDelDeduccion } = await supabase
    .from('sgrh_nomina_linea_deduccion')
    .delete()
    .eq('ded_nomina_detalle_id', detalleDestino.ndt_id)
  if (errDelIngreso || errDelDeduccion) {
    return { ok: false, error: 'No se pudieron actualizar las líneas del periodo destino.' }
  }

  const ingresos = lineas
    .filter((l) => l.esIngreso)
    .map((l) => ({
      ing_nomina_detalle_id: detalleDestino.ndt_id,
      ing_concepto_id: l.con_id,
      ing_monto: l.monto,
    }))
  if (ingresos.length > 0) {
    const { error } = await supabase.from('sgrh_nomina_linea_ingreso').insert(ingresos)
    if (error) return { ok: false, error: 'No se pudieron guardar las líneas de ingreso.' }
  }

  const deducciones = lineas
    .filter((l) => !l.esIngreso)
    .map((l) => ({
      ded_nomina_detalle_id: detalleDestino.ndt_id,
      ded_concepto_id: l.con_id,
      ded_monto: l.monto,
      ded_porcentaje_aplicado: l.porcentajeAplicado ?? null,
      ded_base_calculo: l.baseCalculo ?? null,
    }))
  if (deducciones.length > 0) {
    const { error } = await supabase.from('sgrh_nomina_linea_deduccion').insert(deducciones)
    if (error) return { ok: false, error: 'No se pudieron guardar las líneas de deducción.' }
  }

  const { error: errResolver } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .update({
      bhm_estado: 'pagado',
      bhm_monto_pagado: parsed.data.monto,
      bhm_nomina_detalle_pago_id: detalleDestino.ndt_id,
      bhm_fecha_resolucion: new Date().toISOString(),
    })
    .eq('bhm_id', parsed.data.bhmId)
  if (errResolver) {
    return {
      ok: false,
      error:
        'Se pagó el monto en la planilla, pero no se pudo marcar el movimiento como pagado. Avisá para revisarlo a mano.',
    }
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
