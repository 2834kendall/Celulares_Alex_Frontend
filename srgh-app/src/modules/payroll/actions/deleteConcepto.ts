'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteConceptoResult = { ok: true } | { ok: false; error: string }

/**
 * Intenta el borrado definitivo del concepto. Si ya tiene líneas de
 * ingreso/deducción/patronal asociadas en alguna planilla, la FK lo impide —
 * en ese caso se desactiva (con_activo = false) para que deje de ofrecerse
 * en nuevas planillas sin perder el historial ya guardado. Mismo criterio
 * que deleteRubro en evaluations.
 */
export async function deleteConcepto(id: number): Promise<DeleteConceptoResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error: deleteError } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .delete()
    .eq('con_id', id)

  if (!deleteError) {
    revalidatePath('/payroll/concepts')
    revalidatePath('/payroll')
    return { ok: true }
  }

  const { error: deactivateError } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .update({ con_activo: false })
    .eq('con_id', id)

  if (deactivateError) {
    return { ok: false, error: 'No se pudo eliminar el concepto.' }
  }

  revalidatePath('/payroll/concepts')
  revalidatePath('/payroll')
  return { ok: true }
}
