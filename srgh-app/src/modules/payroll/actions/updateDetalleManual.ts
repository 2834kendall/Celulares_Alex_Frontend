'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { editarDetalleSchema, type EditarDetalleInput } from '@/modules/payroll/types'
import { calcularPlanillaPorConceptos, type ConceptoCalculo } from '@/modules/payroll/lib/planilla'
import { reemplazarLineasDetalle } from '@/modules/payroll/lib/lineasNomina'
import { sincronizarMovimientoBancoHoras } from '@/modules/payroll/lib/bancoHorasAccrual'

interface DetalleActualRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  ndt_historial_laboral_id: number
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
    .select(
      'ndt_id, ndt_nomina_periodo_id, ndt_historial_laboral_id, sgrh_nomina_periodo ( npe_estado )'
    )
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
    .select(
      'con_id, con_codigo, con_tipo, con_afecta_salario_bruto, con_afecta_base_ccss, con_tipo_calculo, con_porcentaje'
    )
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

  const {
    salarioBruto,
    totalDeducciones,
    salarioNeto,
    totalCargasPatronales,
    lineas,
    lineasPatronales,
  } = calcularPlanillaPorConceptos(conceptos, parsed.data)

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_salario_bruto: salarioBruto,
      ndt_total_deducciones_obreras: totalDeducciones,
      ndt_salario_neto: salarioNeto,
      ndt_total_cargas_patronales: totalCargasPatronales,
      ndt_horas_ordinarias_diurnas: parsed.data.horasTrabajadas,
      ndt_horas_extra_al_50: parsed.data.horasExtra,
      ndt_salario_por_hora: parsed.data.salarioPorHora,
    })
    .eq('ndt_id', ndtId)
  if (errUpdate) {
    return { ok: false, error: 'No se pudieron guardar los montos.' }
  }

  const { error: errLineas } = await reemplazarLineasDetalle(
    supabase,
    ndtId,
    lineas,
    lineasPatronales
  )
  if (errLineas) {
    return { ok: false, error: errLineas }
  }

  // Si las horas trabajadas pasan del tope normal, esas horas de más quedan
  // pendientes en el banco de horas (ya no se pagan solas aquí).
  const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
    ndtId,
    historialLaboralId: detalle.ndt_historial_laboral_id,
    horasExtra: parsed.data.horasExtra,
    salarioPorHora: parsed.data.salarioPorHora,
  })
  if (errBanco) {
    return { ok: false, error: errBanco }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${detalle.ndt_nomina_periodo_id}`)
  revalidatePath('/payroll/banco-horas')
  return { ok: true }
}
