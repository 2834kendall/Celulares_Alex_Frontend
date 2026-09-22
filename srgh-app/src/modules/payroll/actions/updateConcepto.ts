'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  ERROR_CONCEPTO_HORAS_EXTRA_ACTIVO,
  conceptoDuplicariaHorasExtra,
  conceptoNominaSchema,
  type ConceptoNominaInput,
} from '@/modules/payroll/types'
import {
  CODIGO_AJUSTE,
  CODIGO_SALARIO_BASE,
  ERROR_CONCEPTO_AJUSTE_PROTEGIDO,
  ERROR_CONCEPTO_BASE_PROTEGIDO,
} from '@/modules/payroll/lib/planilla'

export type UpdateConceptoResult = { ok: true } | { ok: false; error: string }

/**
 * Actualiza un concepto existente — incluidos los precargados por el seed
 * (BASE, COMISION, CCSS_OBRERA, etc.). Todo es editable; si el concepto lo
 * usa la plantilla de Excel, el aviso vive en la UI (ConceptosList), no aquí.
 *
 * La excepción es BASE. El resto del sistema no conoce ningún código de
 * memoria, pero ese sí: el prellenado desde asistencia y la plantilla de Excel
 * escriben el salario de la quincena en `montos.BASE` y el motor lo recoge
 * buscándolo por código. Desactivarlo, renombrarlo o sacarlo del salario bruto
 * no daba ningún error acá y rompía la planilla allá: las filas seguían
 * mostrando las horas bien y el total en ₡0, sin nada que explicara por qué.
 * Se sigue pudiendo cambiar su nombre visible y su fórmula base.
 */
export async function updateConcepto(
  id: number,
  input: ConceptoNominaInput
): Promise<UpdateConceptoResult> {
  const parsed = conceptoNominaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del concepto inválidos.' }
  }

  if (conceptoDuplicariaHorasExtra(parsed.data)) {
    return { ok: false, error: ERROR_CONCEPTO_HORAS_EXTRA_ACTIVO }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()

  const { data: actual, error: errActual } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select('con_codigo')
    .eq('con_id', id)
    .maybeSingle<{ con_codigo: string }>()

  if (errActual) {
    return { ok: false, error: 'No se pudo cargar el concepto.' }
  }
  if (!actual) {
    return { ok: false, error: 'El concepto no existe o no es visible.' }
  }

  if (actual.con_codigo === CODIGO_SALARIO_BASE) {
    // Las cuatro condiciones que el motor necesita para recoger el monto (ver
    // hayConceptoSalarioBase). Cualquiera que falte deja la planilla en ₡0.
    const sigueSirviendo =
      parsed.data.con_codigo.toUpperCase() === CODIGO_SALARIO_BASE &&
      parsed.data.con_activo &&
      parsed.data.con_tipo === 'ingreso' &&
      parsed.data.con_tipo_calculo === 'monto_manual_ingreso' &&
      parsed.data.con_afecta_salario_bruto !== false

    if (!sigueSirviendo) {
      return { ok: false, error: ERROR_CONCEPTO_BASE_PROTEGIDO }
    }
  }

  // Mismo resguardo para el ajuste automático: el sistema escribe su monto
  // por código, y sin él la diferencia entre el base y el real no se paga.
  if (actual.con_codigo === CODIGO_AJUSTE) {
    const sigueSirviendo =
      parsed.data.con_codigo.toUpperCase() === CODIGO_AJUSTE &&
      parsed.data.con_activo &&
      parsed.data.con_tipo === 'ingreso' &&
      parsed.data.con_tipo_calculo === 'monto_manual_ingreso' &&
      parsed.data.con_afecta_salario_bruto !== false

    if (!sigueSirviendo) {
      return { ok: false, error: ERROR_CONCEPTO_AJUSTE_PROTEGIDO }
    }
  }

  const { error } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .update({
      con_codigo: parsed.data.con_codigo.toUpperCase(),
      con_nombre: parsed.data.con_nombre,
      con_tipo: parsed.data.con_tipo,
      con_tipo_calculo: parsed.data.con_tipo_calculo,
      con_porcentaje: parsed.data.con_porcentaje,
      con_afecta_salario_bruto: parsed.data.con_afecta_salario_bruto,
      con_afecta_base_ccss: parsed.data.con_afecta_base_ccss,
      con_formula_base: parsed.data.con_formula_base ?? null,
      con_activo: parsed.data.con_activo,
    })
    .eq('con_id', id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Ya existe un concepto con ese código.' }
    }
    return { ok: false, error: 'No se pudo actualizar el concepto.' }
  }

  revalidatePath('/payroll/concepts')
  revalidatePath('/payroll')
  return { ok: true }
}
