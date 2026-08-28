'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { onboardingEmpleadoSchema, type OnboardingEmpleadoInput } from '@/modules/employees/types'
import { mapEmployeeUniqueError } from '@/modules/employees/lib/dbErrors'
import { validateDatosPago } from '@/modules/employees/lib/validateDatosPago'
import { encryptField } from '@/lib/crypto/fieldCrypto'
import { inviteUser } from '@/modules/users/actions/inviteUser'

export type CreateEmployeeResult =
  | { ok: true; empId: number; usuarioWarning?: string }
  | { ok: false; error: string; requiereConfirmacion?: true }

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

  // El número de cuenta viaja cifrado a la RPC, así que la coherencia con el
  // banco y la detección de cuentas repetidas tienen que resolverse acá: en SQL
  // ya no hay texto plano que mirar. Va antes de la RPC para no dejar un
  // empleado creado y después fallar por los datos de pago.
  const pago = await validateDatosPago(supabase, parsed.data.datos_pago, {
    confirmado: parsed.data.confirmar_cuenta_duplicada,
  })

  if (!pago.ok) return pago

  const datosPago = parsed.data.datos_pago && {
    ...parsed.data.datos_pago,
    edp_numero_cuenta: parsed.data.datos_pago.edp_numero_cuenta
      ? await encryptField(parsed.data.datos_pago.edp_numero_cuenta)
      : null,
    // Ciphertext y HMAC se escriben siempre juntos (constraint
    // edp_cuenta_hmac_pareado); validateDatosPago devuelve null cuando no hay
    // cuenta, que es justo lo que hace falta para cumplirlo.
    edp_cuenta_hmac: pago.hmac,
  }

  const { data: empId, error } = await supabase.rpc('crear_empleado_completo', {
    p_empleado: parsed.data.empleado,
    p_contratacion: parsed.data.contratacion,
    p_datos_pago: datosPago,
    // Sin dir_codigo_postal: lo calcula el trigger desde el distrito.
    p_direccion: parsed.data.direccion,
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
      // check_violation: las validaciones de coherencia que le quedan a la RPC
      // ("cuenta sin banco", "sin índice de cuenta") y los CHECK de la tabla.
      // Los mensajes de la RPC ya están escritos para la UI; los del constraint
      // no, pero son un bug nuestro, no algo que el usuario pueda corregir.
      return { ok: false, error: error.message || 'Los datos de pago no son coherentes.' }
    }
    return { ok: false, error: 'No se pudo crear el empleado.' }
  }

  let usuarioWarning: string | undefined
  if (parsed.data.usuario) {
    const inviteResult = await inviteUser({ ...parsed.data.usuario, empleado_id: empId })
    if (!inviteResult.ok) {
      usuarioWarning = `Empleado creado, pero la cuenta de usuario no se completó: ${inviteResult.error}`
    }
  }

  revalidatePath('/employees')
  return { ok: true, empId, usuarioWarning }
}
