'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { DetalleNominaItem, PeriodoDetalle } from '@/modules/payroll/types'
import { CONCEPTOS_PLANILLA, type MontosPorConcepto } from '@/modules/payroll/lib/planilla'

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
  ndt_salario_bruto: number
  ndt_total_deducciones_obreras: number
  ndt_total_cargas_patronales: number
  ndt_salario_neto: number
  ndt_pagado: boolean
  sgrh_historial_laboral: {
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
      emp_apellido_2: string | null
    } | null
  } | null
}

interface LineaIngresoRow {
  ing_nomina_detalle_id: number
  ing_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string } | null
}

const MONTOS_EN_CERO: MontosPorConcepto = {
  BASE: 0,
  FERIADO: 0,
  COMISION: 0,
  HORAS_EXTRA: 0,
  AJUSTE: 0,
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

  const { data: detalles, error: errDetalles } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `
      ndt_id,
      ndt_salario_bruto,
      ndt_total_deducciones_obreras,
      ndt_total_cargas_patronales,
      ndt_salario_neto,
      ndt_pagado,
      sgrh_historial_laboral (
        sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2 )
      )
    `
    )
    .eq('ndt_nomina_periodo_id', periodoId)
    .order('ndt_id', { ascending: true })
    .returns<DetalleRow[]>()

  if (errDetalles) {
    return { ok: false, error: 'No se pudo cargar la planilla del periodo.' }
  }

  // Montos crudos por concepto (para poder editarlos sin volver a subir el
  // Excel). Es información complementaria: si esta consulta falla, se
  // muestran los totales igual y los montos crudos quedan en cero — no se
  // bloquea toda la pantalla por esto.
  const idsDetalle = (detalles ?? []).map((d: DetalleRow) => d.ndt_id)
  const montosPorNdt = new Map<number, MontosPorConcepto>()
  if (idsDetalle.length > 0) {
    const { data: lineasIngreso } = await supabase
      .from('sgrh_nomina_linea_ingreso')
      .select('ing_nomina_detalle_id, ing_monto, sgrh_cat_conceptos_nomina ( con_codigo )')
      .in('ing_nomina_detalle_id', idsDetalle)
      .returns<LineaIngresoRow[]>()

    for (const linea of lineasIngreso ?? []) {
      const codigo = linea.sgrh_cat_conceptos_nomina?.con_codigo
      if (!codigo || !(CONCEPTOS_PLANILLA.ingresos as readonly string[]).includes(codigo)) continue
      const montos = montosPorNdt.get(linea.ing_nomina_detalle_id) ?? { ...MONTOS_EN_CERO }
      montos[codigo as (typeof CONCEPTOS_PLANILLA.ingresos)[number]] = linea.ing_monto
      montosPorNdt.set(linea.ing_nomina_detalle_id, montos)
    }
  }

  const items: DetalleNominaItem[] = (detalles ?? []).map((row: DetalleRow) => {
    const empleado = row.sgrh_historial_laboral?.sgrh_empleados
    const nombre = empleado
      ? [empleado.emp_nombre, empleado.emp_apellido_1, empleado.emp_apellido_2]
          .filter(Boolean)
          .join(' ')
      : 'Empleado no disponible'
    const montos = montosPorNdt.get(row.ndt_id) ?? MONTOS_EN_CERO

    return {
      id: row.ndt_id,
      empleadoNombre: nombre,
      salarioBruto: row.ndt_salario_bruto,
      totalDeducciones: row.ndt_total_deducciones_obreras,
      cargasPatronales: row.ndt_total_cargas_patronales,
      salarioNeto: row.ndt_salario_neto,
      pagado: row.ndt_pagado,
      base: montos.BASE,
      feriado: montos.FERIADO,
      comision: montos.COMISION,
      horasExtra: montos.HORAS_EXTRA,
      ajuste: montos.AJUSTE,
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
