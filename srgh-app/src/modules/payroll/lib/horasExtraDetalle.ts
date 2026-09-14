/**
 * Sumar o restar un monto de HORAS_EXTRA en el detalle de un periodo,
 * recalculándolo entero.
 *
 * Lo comparten pagar un movimiento del banco de horas y revertirlo. El
 * recálculo tiene que pasar por el motor completo y no por un simple UPDATE
 * del bruto: la CCSS obrera y las cargas patronales son porcentajes sobre ese
 * bruto, así que mover el monto sin recalcularlas dejaría el neto mal.
 *
 * HORAS_EXTRA está DESACTIVADO en el catálogo desde que existe el banco de
 * horas (si estuviera activo, las mismas horas se pagarían dos veces: una en
 * el bruto de la quincena y otra al liquidar el banco). Su fila igual tiene
 * que existir, y acá se usa forzada a "monto manual" solo para esta operación.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { calcularPlanillaPorConceptos, type ConceptoCalculo } from '@/modules/payroll/lib/planilla'
import { reemplazarLineasDetalle } from '@/modules/payroll/lib/lineasNomina'
import {
  CAMPOS_CONCEPTO_DE_LINEA,
  esLineaAjena,
  fusionarAjenas,
  type ConceptoDeLinea,
  type LineaAjena,
} from '@/modules/payroll/lib/lineasAjenas'
import { round2 } from '@/modules/payroll/lib/numeros'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface DetalleRow {
  ndt_id: number
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_salario_por_hora: number
}

interface LineaIngresoRow {
  ing_monto: number
  sgrh_cat_conceptos_nomina: ConceptoDeLinea | null
}

interface LineaDeduccionRow {
  ded_monto: number
  sgrh_cat_conceptos_nomina: ConceptoDeLinea | null
}

/** Diferencia que se considera redondeo y no un faltante real. */
const TOLERANCIA = 0.01

/**
 * Aplica `delta` al monto de HORAS_EXTRA del detalle y recalcula la fila.
 *
 * `delta` positivo suma (pagar horas del banco), negativo resta (revertir ese
 * pago).
 *
 * Restar más de lo que la línea tiene NO se recorta a cero: se devuelve error.
 * Recortarlo era peor que fallar. Si dos movimientos se pagaron en la misma
 * quincena (30 000 + 20 000 = 50 000) y el primero se revierte dos veces —
 * cosa que pasa si el update del movimiento falla y el encargado vuelve a
 * apretar el botón—, el clamp se comía los 20 000 del OTRO movimiento sin
 * decir nada, y ese segundo movimiento seguía marcado como pagado apuntando a
 * una plata que ya no estaba en la planilla.
 */
export async function aplicarHorasExtraEnDetalle(
  supabase: SupabaseServerClient,
  detalle: DetalleRow,
  delta: number
): Promise<{ error: string | null }> {
  const [{ data: conceptosActivos, error: errConceptos }, { data: horasExtraConcepto }] =
    await Promise.all([
      supabase
        .from('sgrh_cat_conceptos_nomina')
        .select(CAMPOS_CONCEPTO_DE_LINEA)
        .eq('con_activo', true)
        .returns<ConceptoCalculo[]>(),
      supabase
        .from('sgrh_cat_conceptos_nomina')
        .select(CAMPOS_CONCEPTO_DE_LINEA)
        .eq('con_codigo', 'HORAS_EXTRA')
        .maybeSingle<ConceptoCalculo>(),
    ])

  if (errConceptos) {
    return { error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }
  if (!horasExtraConcepto) {
    return {
      error:
        'No se encontró el concepto "HORAS_EXTRA" en el catálogo. Es necesario para registrar el movimiento.',
    }
  }

  const base: ConceptoCalculo[] = [
    ...(conceptosActivos ?? []),
    { ...horasExtraConcepto, con_tipo_calculo: 'monto_manual_ingreso' },
  ]
  const codigosQueSeRecalculan = new Set(base.map((c) => c.con_codigo))

  // Montos ya guardados, para no perderlos al recalcular. Hay que leer las DOS
  // tablas: más abajo se borran y se rehacen todas las líneas desde lo que
  // devuelva el motor, así que cualquier concepto que no llegue en `montos`
  // desaparece. Leyendo solo los ingresos, una deducción manual del periodo
  // (préstamo, embargo, renta) se borraba en silencio y el neto subía.
  const [
    { data: lineasIngreso, error: errLineasIngreso },
    { data: lineasDeduccion, error: errLineasDeduccion },
  ] = await Promise.all([
    supabase
      .from('sgrh_nomina_linea_ingreso')
      .select(`ing_monto, sgrh_cat_conceptos_nomina ( ${CAMPOS_CONCEPTO_DE_LINEA} )`)
      .eq('ing_nomina_detalle_id', detalle.ndt_id)
      .returns<LineaIngresoRow[]>(),
    supabase
      .from('sgrh_nomina_linea_deduccion')
      .select(`ded_monto, sgrh_cat_conceptos_nomina ( ${CAMPOS_CONCEPTO_DE_LINEA} )`)
      .eq('ded_nomina_detalle_id', detalle.ndt_id)
      .returns<LineaDeduccionRow[]>(),
  ])

  if (errLineasIngreso || errLineasDeduccion) {
    return { error: 'No se pudo cargar el detalle del periodo.' }
  }

  const montos: Record<string, number> = {}
  // Líneas de conceptos que el motor NO va a volver a producir (uno que se
  // desactivó del catálogo mientras el periodo seguía en borrador): se
  // conservan tal cual (ver lib/lineasAjenas.ts).
  const ajenas: LineaAjena[] = []

  for (const linea of lineasIngreso ?? []) {
    const concepto = linea.sgrh_cat_conceptos_nomina
    if (!concepto) continue
    if (esLineaAjena(concepto, codigosQueSeRecalculan)) {
      ajenas.push({ concepto, monto: linea.ing_monto, esIngreso: true })
      continue
    }
    montos[concepto.con_codigo] = linea.ing_monto
  }
  for (const linea of lineasDeduccion ?? []) {
    const concepto = linea.sgrh_cat_conceptos_nomina
    if (!concepto) continue
    if (esLineaAjena(concepto, codigosQueSeRecalculan)) {
      ajenas.push({ concepto, monto: linea.ded_monto, esIngreso: false })
      continue
    }
    // Solo las deducciones de monto manual: las porcentuales (CCSS) las vuelve
    // a calcular el motor sobre el bruto nuevo, arrastrar su monto viejo sería
    // un error.
    if (concepto.con_tipo_calculo !== 'monto_manual_deduccion') continue
    montos[concepto.con_codigo] = linea.ded_monto
  }

  const horasExtraActual = montos.HORAS_EXTRA ?? 0
  const nuevoMonto = round2(horasExtraActual + delta)

  if (nuevoMonto < -TOLERANCIA) {
    return {
      error: `La quincena tiene ₡${horasExtraActual.toLocaleString('es-CR')} de horas extra y este movimiento dice haber pagado ₡${Math.abs(delta).toLocaleString('es-CR')}. Alguien ya cambió ese monto, así que revertirlo dejaría la planilla mal. Revisá el detalle del periodo antes de seguir.`,
    }
  }

  montos.HORAS_EXTRA = Math.max(0, nuevoMonto)

  const { conceptos, montos: montosFinales } = fusionarAjenas(base, montos, ajenas)

  const {
    salarioBruto,
    totalDeducciones,
    salarioNeto,
    totalCargasPatronales,
    lineas,
    lineasPatronales,
  } = calcularPlanillaPorConceptos(conceptos, {
    montos: montosFinales,
    horasTrabajadas: detalle.ndt_horas_ordinarias_diurnas,
    // Las horas extra guardadas del periodo, para que recalcular no las
    // pierda. Con HORAS_EXTRA forzado a monto manual acá no las consume nadie,
    // pero pasar 0 sería mentirle al motor.
    horasExtra: detalle.ndt_horas_extra_al_50 ?? 0,
    salarioPorHora: detalle.ndt_salario_por_hora,
  })

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_salario_bruto: salarioBruto,
      ndt_total_deducciones_obreras: totalDeducciones,
      ndt_salario_neto: salarioNeto,
      ndt_total_cargas_patronales: totalCargasPatronales,
    })
    .eq('ndt_id', detalle.ndt_id)

  if (errUpdate) {
    return { error: 'No se pudieron actualizar los montos del periodo.' }
  }

  return reemplazarLineasDetalle(supabase, detalle.ndt_id, lineas, lineasPatronales)
}
