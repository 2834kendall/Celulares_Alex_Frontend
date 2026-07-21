'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { editarDetalleSchema, type EditarDetalleInput } from '@/modules/payroll/types'
import { computeTotales, construirLineas, CONCEPTOS_PLANILLA } from '@/modules/payroll/lib/planilla'

interface ConceptoRow {
  con_id: number
  con_codigo: string
}

interface DetalleActualRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  sgrh_nomina_periodo: { npe_estado: string } | null
}

export type UpdateDetalleManualResult = { ok: true } | { ok: false; error: string }

/**
 * Edita a mano los ingresos de un empleado dentro de un periodo (BASE,
 * FERIADO, COMISION, HORAS_EXTRA, AJUSTE) sin tener que volver a subir el
 * Excel. El rebajo de CCSS nunca se edita aquí: se recalcula siempre a partir
 * de estos montos, igual que hace la subida de planilla. Solo se permite
 * mientras el periodo esté en borrador — una vez aprobado, la planilla queda
 * fija y cualquier ajuste debería pasar por un periodo nuevo.
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

  const codigos = [...CONCEPTOS_PLANILLA.ingresos, CONCEPTOS_PLANILLA.deduccion]
  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select('con_id, con_codigo')
    .in('con_codigo', codigos)
    .returns<ConceptoRow[]>()

  if (errConceptos) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }

  const conceptoId = new Map<string, number>(
    (conceptos ?? []).map((c: ConceptoRow): [string, number] => [c.con_codigo, c.con_id])
  )
  const faltantes = codigos.filter((c) => !conceptoId.has(c))
  if (faltantes.length > 0) {
    return {
      ok: false,
      error: `Faltan conceptos en el catálogo (${faltantes.join(', ')}). Créalos en "Conceptos de nómina" antes de editar.`,
    }
  }

  const totales = computeTotales({ cedula: '', ...parsed.data })
  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_salario_bruto: totales.salarioBruto,
      ndt_total_deducciones_obreras: totales.deduccionCcss,
      ndt_salario_neto: totales.salarioNeto,
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

  const { ingresos, deduccion } = construirLineas(parsed.data, ndtId, conceptoId)

  if (ingresos.length > 0) {
    const { error: errIngreso } = await supabase.from('sgrh_nomina_linea_ingreso').insert(ingresos)
    if (errIngreso) {
      return { ok: false, error: 'No se pudieron guardar las líneas de ingreso.' }
    }
  }

  const { error: errDeduccion } = await supabase
    .from('sgrh_nomina_linea_deduccion')
    .insert(deduccion)
  if (errDeduccion) {
    return { ok: false, error: 'No se pudo guardar la deducción.' }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${detalle.ndt_nomina_periodo_id}`)
  return { ok: true }
}
