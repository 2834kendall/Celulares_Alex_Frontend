'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { terminarContratoSchema, type TerminarContratoInput } from '@/modules/employees/types'
import { mapContractError } from '@/modules/employees/lib/dbErrors'

export type TerminateContractResult =
  { ok: true; programada: boolean } | { ok: false; error: string }

/**
 * Termina el contrato vigente (paso 1 de 2: después se liquida desde
 * Planilla). Con un último día ya pasado cierra en el acto; con uno de hoy o
 * futuro (preaviso) queda programado y el job lo cierra al día siguiente.
 * `programada` le dice a la UI cuál de los dos pasó.
 */
export async function terminateContract(
  labId: number,
  input: TerminarContratoInput
): Promise<TerminateContractResult> {
  if (!Number.isInteger(labId) || labId <= 0) {
    return { ok: false, error: 'Contrato no encontrado.' }
  }

  const parsed = terminarContratoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos de la terminación inválidos.' }
  }

  await requirePermission(PERMISOS.HISTORIAL_WRITE)

  const supabase = await createClient()
  const { data: programada, error } = await supabase.rpc('terminar_contrato', {
    p_lab_id: labId,
    p_fecha_fin: parsed.data.lab_fecha_fin,
    p_motivo_id: parsed.data.lab_motivo_salida_id,
    p_recontratable: parsed.data.lab_recontratable,
    p_observaciones: parsed.data.lab_observaciones_salida ?? undefined,
  })

  if (error) {
    return { ok: false, error: mapContractError(error, 'No se pudo terminar el contrato.') }
  }

  revalidatePath('/employees')
  revalidatePath('/employees/[id]', 'page')
  revalidatePath('/payroll/aguinaldo-liquidacion')
  return { ok: true, programada: programada === true }
}
