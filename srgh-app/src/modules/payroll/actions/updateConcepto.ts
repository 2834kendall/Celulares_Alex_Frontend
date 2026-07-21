'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { conceptoNominaSchema, type ConceptoNominaInput } from '@/modules/payroll/types'

export type UpdateConceptoResult = { ok: true } | { ok: false; error: string }

/**
 * Actualiza un concepto existente — incluidos los precargados por el seed
 * (BASE, COMISION, CCSS_OBRERA, etc.). Todo es editable; si el concepto lo
 * usa la plantilla de Excel, el aviso vive en la UI (ConceptosList), no aquí.
 */
export async function updateConcepto(
  id: number,
  input: ConceptoNominaInput
): Promise<UpdateConceptoResult> {
  const parsed = conceptoNominaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del concepto inválidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .update({
      con_codigo: parsed.data.con_codigo.toUpperCase(),
      con_nombre: parsed.data.con_nombre,
      con_tipo: parsed.data.con_tipo,
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
