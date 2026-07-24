'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { editarDetalleSchema, type EditarDetalleInput } from '@/modules/payroll/types'
import { calcularPlanillaPorConceptos, type ConceptoCalculo } from '@/modules/payroll/lib/planilla'

interface DetalleActualRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  sgrh_nomina_periodo: { npe_estado: string } | null
}

export type UpdateDetalleManualResult = { ok: true } | { ok: false; error: string }

/**
 * Guarda la edición manual del detalle de un empleado dentro del periodo:
 * recalcula bruto/deducciones/neto a partir de los conceptos activos del
 * catálogo (calcularPlanillaPorConceptos) y reemplaza las líneas de ingreso
 * y deducción desde cero. Solo se permite mientras el periodo está en
 * borrador, igual que la subida de Excel.
 */
export async function updateDetalleManual(
  ndtId: number,
  input: EditarDetalleInput
): Promise<UpdateDetalleManualResult> {
  if (!Number.isInteger(ndtId) || ndtId <= 0) {
    return { ok: false, error: 'Detalle inválido.' }
  }

  const parsed = editarDetalleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos inválidos.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: detalle, error: errDetalle } = await supabase
    .from('sgrh_nomina_detalle')
    .select('ndt_id, ndt_nomina_periodo_id, sgrh_nomina_periodo ( npe_estado )')
    .eq('ndt_id', ndtId)
    .maybeSingle<DetalleActualRow>()

  if (errDetalle) {
    return { ok: false, error: 'No se pudo cargar el detalle de la planilla.' }
  }
  if (!detalle) {
    return { ok: false, error: 'El detalle no existe o no es visible.' }
  }
  if (detalle.sgrh_nomina_periodo?.npe_estado !== 'borrador') {
    return {
      ok: false,
      error: 'Solo se puede editar la planilla mientras el periodo está en borrador.',
    }
  }

  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select('con_id, con_codigo, con_tipo_calculo, con_porcentaje')
    .eq('con_activo', true)
    .returns<ConceptoCalculo[]>()

  if (errConceptos) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }
  if (!conceptos || conceptos.length === 0) {
    return {
      ok: false,
      error: 'No hay conceptos activos en el catálogo. Crea al menos uno en "Conceptos de nómina".',
    }
  }

  const { salarioBruto, totalDeducciones, salarioNeto, lineas } = calcularPlanillaPorConceptos(
    conceptos,
    parsed.data
  )

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_salario_bruto: salarioBruto,
      ndt_total_deducciones_obreras: totalDeducciones,
      ndt_salario_neto: salarioNeto,
      ndt_horas_ordinarias_diurnas: parsed.data.horasTrabajadas,
      ndt_salario_por_hora: parsed.data.salarioPorHora,
    })
    .eq('ndt_id', ndtId)
  if (errUpdate) {
    return { ok: false, error: 'No se pudieron guardar los montos.' }
  }

  const { error: errDelIngreso } = await supabase
    .from('sgrh_nomina_linea_ingreso')
    .delete()
    .eq('ing_nomina_detalle_id', ndtId)
  const { error: errDelDeduccion } = await supabase
    .from('sgrh_nomina_linea_deduccion')
    .delete()
    .eq('ded_nomina_detalle_id', ndtId)
  if (errDelIngreso || errDelDeduccion) {
    return { ok: false, error: 'No se pudieron actualizar las líneas de la planilla.' }
  }

  const ingresos = lineas
    .filter((l) => l.esIngreso)
    .map((l) => ({
      ing_nomina_detalle_id: ndtId,
      ing_concepto_id: l.con_id,
      ing_monto: l.monto,
    }))
  if (ingresos.length > 0) {
    const { error: errIngreso } = await supabase.from('sgrh_nomina_linea_ingreso').insert(ingresos)
    if (errIngreso) {
      return { ok: false, error: 'No se pudieron guardar las líneas de ingreso.' }
    }
  }

  const deducciones = lineas
    .filter((l) => !l.esIngreso)
    .map((l) => ({
      ded_nomina_detalle_id: ndtId,
      ded_concepto_id: l.con_id,
      ded_monto: l.monto,
      ded_porcentaje_aplicado: l.porcentajeAplicado ?? null,
      ded_base_calculo: l.baseCalculo ?? null,
    }))
  if (deducciones.length > 0) {
    const { error: errDeduccion } = await supabase
      .from('sgrh_nomina_linea_deduccion')
      .insert(deducciones)
    if (errDeduccion) {
      return { ok: false, error: 'No se pudieron guardar las deducciones.' }
    }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${detalle.ndt_nomina_periodo_id}`)
  return { ok: true }
}
