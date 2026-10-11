'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { editarContratoSchema, type EditarContratoInput } from '@/modules/employees/types'
import { mapContractError } from '@/modules/employees/lib/dbErrors'

export type UpdateContractResult = { ok: true } | { ok: false; error: string }

/**
 * Corrige el contrato vigente mientras todavía no pasó por planilla (la RPC
 * editar_contrato lo verifica). No toca la sucursal: el schema la descarta y
 * la RPC tampoco la escribe.
 */
export async function updateContract(
  labId: number,
  input: EditarContratoInput
): Promise<UpdateContractResult> {
  if (!Number.isInteger(labId) || labId <= 0) {
    return { ok: false, error: 'Contrato no encontrado.' }
  }

  const parsed = editarContratoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del contrato inválidos.' }
  }

  await requirePermission(PERMISOS.HISTORIAL_WRITE)

  const supabase = await createClient()
  const { error } = await supabase.rpc('editar_contrato', {
    p_lab_id: labId,
    p_contrato: parsed.data,
  })

  if (error) {
    return { ok: false, error: mapContractError(error, 'No se pudo editar el contrato.') }
  }

  // La acción recibe el contrato, no el empleado: se revalidan todos los
  // perfiles. El que está abierto además hace router.refresh().
  revalidatePath('/employees')
  revalidatePath('/employees/[id]', 'page')
  return { ok: true }
}
