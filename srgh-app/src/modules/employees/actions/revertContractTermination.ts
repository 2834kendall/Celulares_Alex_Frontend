'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { mapContractError } from '@/modules/employees/lib/dbErrors'

export type RevertContractTerminationResult = { ok: true } | { ok: false; error: string }

/**
 * Deshace una terminación: programada, o ya cerrada pero todavía sin
 * liquidar. La RPC revertir_terminacion lo verifica con el contrato
 * bloqueado, así que no puede cruzarse con una liquidación en curso.
 */
export async function revertContractTermination(
  labId: number
): Promise<RevertContractTerminationResult> {
  if (!Number.isInteger(labId) || labId <= 0) {
    return { ok: false, error: 'Contrato no encontrado.' }
  }

  await requirePermission(PERMISOS.HISTORIAL_WRITE)

  const supabase = await createClient()
  const { error } = await supabase.rpc('revertir_terminacion', { p_lab_id: labId })

  if (error) {
    return { ok: false, error: mapContractError(error, 'No se pudo revertir la terminación.') }
  }

  revalidatePath('/employees')
  revalidatePath('/employees/[id]', 'page')
  revalidatePath('/payroll/aguinaldo-liquidacion')
  return { ok: true }
}
