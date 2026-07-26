'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { calcularMontoIncapacidad } from '@/modules/payroll/lib/incapacidad'
import type { DetalleNominaItem, IncapacidadItem, PeriodoDetalle } from '@/modules/payroll/types'

interface PeriodoRow {
  npe_id: number
  npe_periodo_mes: number
  npe_periodo_anio: number
  npe_quincena: number
  npe_fecha_inicio_periodo: string | null
  npe_fecha_fin_periodo: string | null
  npe_estado: string
  npe_fecha_pago: string | null
  npe_observaciones: string | null
  sgrh_sucursales: { suc_nombre: string | null } | null
}

interface DetalleRow {
  ndt_id: number
  ndt_historial_laboral_id: number
  ndt_salario_bruto: number
  ndt_total_deducciones_obreras: number
  ndt_total_cargas_patronales: number
  ndt_salario_neto: number
  ndt_pagado: boolean
  ndt_fecha_pago: string | null
  ndt_horas_ordinarias_diurnas: number
  ndt_salario_por_hora: number
  ndt_dias_incapacidad_empleador: number
  ndt_dias_incapacidad_ccss: number
  sgrh_historial_laboral: {
    lab_salario_base: number
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
      emp_apellido_2: string | null
      emp_numero_identificacion: string | null
    } | null
  } | null
}

interface TipoAusenciaRow {
  tau_porcentaje_pago_empleador: number
}

interface LineaIngresoRow {
  ing_nomina_detalle_id: number
  ing_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string } | null
}

interface LineaDeduccionRow {
  ded_nomina_detalle_id: number
  ded_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string; con_tipo_calculo: string } | null
}

export type GetPeriodoDetailResult =
  { ok: true; data: PeriodoDetalle } | { ok: false; error: string; notFound?: boolean }

/**
 * Cabecera del periodo + planilla (un detalle por empleado).
 * RLS garantiza que solo se ven periodos de la empresa del JWT.
 */
export async function getPeriodoDetail(periodoId: number): Promise<GetPeriodoDetailResult> {
  await requirePermission(PERMISOS.NOMINA_READ)

  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return { ok: false, error: 'Periodo inválido.', notFound: true }
  }

  const supabase = await createClient()

  const { data: periodo, error: errPeriodo } = await supabase
    .from('sgrh_nomina_periodo')
    .select(
      `
      npe_id,
      npe_periodo_mes,
      npe_periodo_anio,
      npe_quincena,
      npe_fecha_inicio_periodo,
      npe_fecha_fin_periodo,
      npe_estado,
      npe_fecha_pago,
      npe_observaciones,
      sgrh_sucursales ( suc_nombre )
    `
    )
    .eq('npe_id', periodoId)
    .maybeSingle<PeriodoRow>()

  if (errPeriodo) {
    return { ok: false, error: 'No se pudo cargar el periodo de nómina.' }
  }

  if (!periodo) {
    return { ok: false, error: 'El periodo no existe o no es visible.', notFound: true }
  }

  const [{ data: detalles, error: errDetalles }, { data: tipoAusencia }] = await Promise.all([
    supabase
      .from('sgrh_nomina_detalle')
      .select(
        `
      ndt_id,
      ndt_historial_laboral_id,
      ndt_salario_bruto,
      ndt_total_deducciones_obreras,
      ndt_total_cargas_patronales,
      ndt_salario_neto,
      ndt_pagado,
      ndt_fecha_pago,
      ndt_horas_ordinarias_diurnas,
      ndt_salario_por_hora,
      ndt_dias_incapacidad_empleador,
      ndt_dias_incapacidad_ccss,
      sgrh_historial_laboral (
        lab_salario_base,
        sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2, emp_numero_identificacion )
      )
    `
      )
      .eq('ndt_nomina_periodo_id', periodoId)
      .order('ndt_id', { ascending: true })
      .returns<DetalleRow[]>(),
    // % que paga el patrono durante sus días de incapacidad — se lee del
    // catálogo en vez de "adivinarlo" en el código (mismo criterio que el
    // resto del motor de cálculo). Si falla, la incapacidad simplemente no
    // se muestra (no bloquea el resto de la pantalla).
    supabase
      .from('sgrh_cat_tipos_ausencia')
      .select('tau_porcentaje_pago_empleador')
      .eq('tau_codigo', 'INC_ENF')
      .maybeSingle<TipoAusenciaRow>(),
  ])

  if (errDetalles) {
    return { ok: false, error: 'No se pudo cargar la planilla del periodo.' }
  }

  // Montos crudos por concepto (para poder editarlos sin re-subir el Excel, y
  // para mostrar el desglose en el comprobante). Es información
  // complementaria: si estas consultas fallan, se muestran los totales igual
  // y los montos crudos quedan vacíos — no se bloquea toda la pantalla.
  const idsDetalle = (detalles ?? []).map((d: DetalleRow) => d.ndt_id)
  const montosPorNdt = new Map<number, Record<string, number>>()
  // Desglose de "Deducciones" en dos totales, por cómo se calculan:
  //  - porcentual: % del salario bruto (ej. CCSS obrera) — con_tipo_calculo = porcentaje_deduccion_bruto
  //  - manual: monto fijo que el patrono decide (ej. préstamo) — con_tipo_calculo = monto_manual_deduccion
  const deduccionesPorNdt = new Map<number, { porcentual: number; manual: number }>()

  if (idsDetalle.length > 0) {
    const [{ data: lineasIngreso }, { data: lineasDeduccion }] = await Promise.all([
      supabase
        .from('sgrh_nomina_linea_ingreso')
        .select('ing_nomina_detalle_id, ing_monto, sgrh_cat_conceptos_nomina ( con_codigo )')
        .in('ing_nomina_detalle_id', idsDetalle)
        .returns<LineaIngresoRow[]>(),
      supabase
        .from('sgrh_nomina_linea_deduccion')
        .select(
          'ded_nomina_detalle_id, ded_monto, sgrh_cat_conceptos_nomina ( con_codigo, con_tipo_calculo )'
        )
        .in('ded_nomina_detalle_id', idsDetalle)
        .returns<LineaDeduccionRow[]>(),
    ])

    for (const linea of lineasIngreso ?? []) {
      const codigo = linea.sgrh_cat_conceptos_nomina?.con_codigo
      if (!codigo) continue
      const montos = montosPorNdt.get(linea.ing_nomina_detalle_id) ?? {}
      montos[codigo] = linea.ing_monto
      montosPorNdt.set(linea.ing_nomina_detalle_id, montos)
    }
    for (const linea of lineasDeduccion ?? []) {
      const codigo = linea.sgrh_cat_conceptos_nomina?.con_codigo
      if (!codigo) continue
      const montos = montosPorNdt.get(linea.ded_nomina_detalle_id) ?? {}
      montos[codigo] = linea.ded_monto
      montosPorNdt.set(linea.ded_nomina_detalle_id, montos)

      const acumulado = deduccionesPorNdt.get(linea.ded_nomina_detalle_id) ?? {
        porcentual: 0,
        manual: 0,
      }
      if (linea.sgrh_cat_conceptos_nomina?.con_tipo_calculo === 'porcentaje_deduccion_bruto') {
        acumulado.porcentual += linea.ded_monto
      } else {
        acumulado.manual += linea.ded_monto
      }
      deduccionesPorNdt.set(linea.ded_nomina_detalle_id, acumulado)
    }
  }

  const items: DetalleNominaItem[] = (detalles ?? []).map((row: DetalleRow) => {
    const empleado = row.sgrh_historial_laboral?.sgrh_empleados
    const nombre = empleado
      ? [empleado.emp_nombre, empleado.emp_apellido_1, empleado.emp_apellido_2]
          .filter(Boolean)
          .join(' ')
      : 'Empleado no disponible'

    const deducciones = deduccionesPorNdt.get(row.ndt_id) ?? { porcentual: 0, manual: 0 }

    let incapacidad: IncapacidadItem | null = null
    if (
      (row.ndt_dias_incapacidad_empleador > 0 || row.ndt_dias_incapacidad_ccss > 0) &&
      tipoAusencia
    ) {
      const salarioDiario = (row.sgrh_historial_laboral?.lab_salario_base ?? 0) / 30
      incapacidad = {
        diasEmpleador: row.ndt_dias_incapacidad_empleador,
        diasCcss: row.ndt_dias_incapacidad_ccss,
        porcentajePagoEmpleador: tipoAusencia.tau_porcentaje_pago_empleador,
        monto: calcularMontoIncapacidad(
          row.ndt_dias_incapacidad_empleador,
          salarioDiario,
          tipoAusencia.tau_porcentaje_pago_empleador
        ),
      }
    }

    return {
      id: row.ndt_id,
      historialLaboralId: row.ndt_historial_laboral_id,
      empleadoNombre: nombre,
      empleadoCedula: empleado?.emp_numero_identificacion ?? '—',
      salarioBruto: row.ndt_salario_bruto,
      totalDeducciones: row.ndt_total_deducciones_obreras,
      deduccionPorcentual: deducciones.porcentual,
      deduccionManual: deducciones.manual,
      cargasPatronales: row.ndt_total_cargas_patronales,
      salarioNeto: row.ndt_salario_neto,
      pagado: row.ndt_pagado,
      fechaPago: row.ndt_fecha_pago,
      montosPorConcepto: montosPorNdt.get(row.ndt_id) ?? {},
      horasTrabajadas: row.ndt_horas_ordinarias_diurnas,
      salarioPorHora: row.ndt_salario_por_hora,
      incapacidad,
    }
  })

  return {
    ok: true,
    data: {
      id: periodo.npe_id,
      mes: periodo.npe_periodo_mes,
      anio: periodo.npe_periodo_anio,
      quincena: periodo.npe_quincena,
      fechaInicio: periodo.npe_fecha_inicio_periodo,
      fechaFin: periodo.npe_fecha_fin_periodo,
      estado: periodo.npe_estado,
      fechaPago: periodo.npe_fecha_pago,
      observaciones: periodo.npe_observaciones,
      sucursalNombre: periodo.sgrh_sucursales?.suc_nombre ?? '—',
      detalles: items,
    },
  }
}
