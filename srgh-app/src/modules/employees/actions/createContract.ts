'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  crearHistorialLaboralSchema,
  type CrearHistorialLaboralInput,
} from '@/modules/employees/types'
import { mapContractError } from '@/modules/employees/lib/dbErrors'

export type CreateContractResult = { ok: true } | { ok: false; error: string }

/**
 * Nuevo contrato para un empleado sin contrato vigente (recontratación).
 * Las reglas viven en la RPC crear_contrato, en una sola transacción: sin
 * vigente, el anterior ya liquidado, puesto y sucursal de la empresa del JWT
 * y fechas coherentes con el ingreso y el contrato anterior.
 */
export async function createContract(
  empId: number,
  input: CrearHistorialLaboralInput
): Promise<CreateContractResult> {
  if (!Number.isInteger(empId) || empId <= 0) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  const parsed = crearHistorialLaboralSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del contrato inválidos.' }
  }

  await requirePermission(PERMISOS.HISTORIAL_WRITE)

  const supabase = await createClient()
  const { error } = await supabase.rpc('crear_contrato', {
    p_empleado_id: empId,
    p_contrato: parsed.data,
  })

  if (error) {
    return { ok: false, error: mapContractError(error, 'No se pudo registrar el contrato.') }
  }

  revalidatePath('/employees')
  revalidatePath(`/employees/${empId}`)
  return { ok: true }
}
