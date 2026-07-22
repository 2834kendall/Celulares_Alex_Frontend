'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { conceptoNominaSchema, type ConceptoNominaInput } from '@/modules/payroll/types'

export type CreateConceptoResult = { ok: true; id: number } | { ok: false; error: string }

export async function createConcepto(input: ConceptoNominaInput): Promise<CreateConceptoResult> {
  const parsed = conceptoNominaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del concepto inválidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .insert({
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
    .select('con_id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Ya existe un concepto con ese código.' }
    }
    return {
      ok: false,
      error: 'No se pudo crear el concepto. Verifique que el código no se repita.',
    }
  }

  revalidatePath('/payroll/concepts')
  revalidatePath('/payroll')
  return { ok: true, id: data.con_id }
}
