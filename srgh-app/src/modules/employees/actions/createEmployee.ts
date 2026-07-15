'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { onboardingEmpleadoSchema, type OnboardingEmpleadoInput } from '@/modules/employees/types'
import { mapEmployeeUniqueError } from '@/modules/employees/lib/dbErrors'
import { inviteEmployeeUser } from './inviteEmployeeUser'

export type CreateEmployeeResult =
  { ok: true; empId: number; usuarioWarning?: string } | { ok: false; error: string }

/**
 * Alta completa: empleado + contrato (+ datos de pago y usuario opcionales).
 *
 * La escritura multi-tabla vive en la RPC crear_empleado_completo: una
 * transacción atómica en Postgres (SECURITY DEFINER) que re-verifica el
 * permiso y toma la empresa del JWT. Sin compensación manual ni ventana de
 * empleados huérfanos; se llama con el cliente de sesión, no con el admin.
 */
export async function createEmployee(
  input: OnboardingEmpleadoInput
): Promise<CreateEmployeeResult> {
  const parsed = onboardingEmpleadoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del empleado inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const meta = claims.app_metadata as { permisos?: string[] }

  if (parsed.data.usuario && !(meta?.permisos ?? []).includes(PERMISOS.USUARIOS_WRITE)) {
    return { ok: false, error: 'No tienes permiso para crear usuarios del sistema.' }
  }

  const supabase = await createClient()
  const { data: empId, error } = await supabase.rpc('crear_empleado_completo', {
    p_empleado: parsed.data.empleado,
    p_contratacion: parsed.data.contratacion,
    p_datos_pago: parsed.data.datos_pago,
  })

  if (error || typeof empId !== 'number') {
    const uniqueError = mapEmployeeUniqueError(error)
    if (uniqueError) {
      return { ok: false, error: uniqueError }
    }
    if (error?.code === '42501') {
      return { ok: false, error: 'No tienes permiso para crear empleados.' }
    }
    if (error?.code === '23514') {
      // check_violation: solo lo emiten las validaciones de coherencia de la
      // RPC (SINPE/IBAN/banco), cuyos mensajes ya están escritos para la UI.
      return { ok: false, error: error.message || 'Los datos de pago no son coherentes.' }
    }
    return { ok: false, error: 'No se pudo crear el empleado.' }
  }

  let usuarioWarning: string | undefined
  if (parsed.data.usuario) {
    const inviteResult = await inviteEmployeeUser(empId, parsed.data.usuario)
    if (!inviteResult.ok) {
      usuarioWarning = `Empleado creado, pero la cuenta de usuario no se completó: ${inviteResult.error}`
    }
  }

  revalidatePath('/employees')
  return { ok: true, empId, usuarioWarning }
}
