'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { editarFichaEmpleadoSchema, type EditarFichaEmpleadoInput } from '@/modules/employees/types'
import { mapEmployeeUniqueError } from '@/modules/employees/lib/dbErrors'
import { validateDatosPago } from '@/modules/employees/lib/validateDatosPago'
import { decryptField, encryptField } from '@/lib/crypto/fieldCrypto'

export type UpdateEmployeeResult =
  { ok: true; warning?: string } | { ok: false; error: string; requiereConfirmacion?: true }

/** Se conservó la cuenta ilegible en vez de borrarla. Ver el guard más abajo. */
const CUENTA_PRESERVADA =
  'Los cambios se guardaron. La cuenta bancaria registrada no se pudo descifrar y se conservó ' +
  'intacta — escribí el número de nuevo para reemplazarla.'

/**
 * Edición de la ficha personal + dirección + datos de pago. Usa el cliente de
 * sesión: la RLS de sgrh_empleados pasa (el empleado ya tiene historial) y las
 * de sgrh_empleado_datos_pago / sgrh_direcciones exigen EMPLEADOS_WRITE de la
 * misma empresa.
 */
export async function updateEmployee(
  empId: number,
  input: EditarFichaEmpleadoInput
): Promise<UpdateEmployeeResult> {
  const parsed = editarFichaEmpleadoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del empleado inválidos.' }
  }

  if (!Number.isInteger(empId) || empId <= 0) {
    return { ok: false, error: 'Empleado no encontrado.' }
  }

  await requirePermission(PERMISOS.EMPLEADOS_WRITE)

  const supabase = await createClient()

  // El schema ya validó formato y checksum del IBAN; lo que necesita consultar
  // la base (banco activo, código de entidad, cuenta repetida) vive en
  // validateDatosPago. Se valida ANTES de escribir para no dejar guardados
  // parciales — esta action no es transaccional.
  const pago = await validateDatosPago(supabase, parsed.data.datos_pago, {
    empIdActual: empId,
    confirmado: parsed.data.confirmar_cuenta_duplicada,
  })

  if (!pago.ok) return pago

  // ─── Guard: un campo vacío no siempre significa "borrar" ──────────────────
  // Desde que la cuenta se guarda cifrada existe un estado que antes no podía
  // darse: hay un número registrado pero no se pudo descifrar (llave rotada mal,
  // payload alterado). En ese caso getEmployeeDetail devuelve null y el
  // formulario se pinta VACÍO. Si tomáramos ese vacío como intención de borrar,
  // editar el teléfono de un empleado bastaría para escribir null encima del
  // ciphertext y perder la cuenta para siempre.
  //
  // La regla: vacío solo significa "borrar" si el usuario pudo ver lo que había.
  // Escribir un valor nuevo, en cambio, siempre vale — es como se repara una
  // fila corrupta.
  let cuentaPreservada = false

  if (parsed.data.datos_pago && !parsed.data.datos_pago.edp_numero_cuenta) {
    const { data: actual } = await supabase
      .from('sgrh_empleado_datos_pago')
      .select('edp_numero_cuenta')
      .eq('edp_empleado_id', empId)
      .maybeSingle()

    if (actual?.edp_numero_cuenta) {
      cuentaPreservada = !(await decryptField(actual.edp_numero_cuenta)).ok
    }
  }

  const { data, error } = await supabase
    .from('sgrh_empleados')
    .update(parsed.data.empleado)
    .eq('emp_id', empId)
    .select('emp_id, emp_direccion_id')
    .single()

  if (error || !data) {
    const uniqueError = mapEmployeeUniqueError(error)
    if (uniqueError) {
      return { ok: false, error: uniqueError }
    }
    return { ok: false, error: 'No se pudo actualizar el empleado.' }
  }

  // La dirección es PADRE del empleado (el FK sale de sgrh_empleados), así que
  // no es un upsert como los datos de pago: o se actualiza la fila existente, o
  // se crea y se enlaza. dir_codigo_postal nunca se envía — lo recalcula el
  // trigger desde el distrito.
  const direccionError =
    'Los datos personales se guardaron, pero la dirección no. Intenta de nuevo.'

  if (data.emp_direccion_id) {
    const { error: errDireccion } = await supabase
      .from('sgrh_direcciones')
      .update(parsed.data.direccion)
      .eq('dir_id', data.emp_direccion_id)

    if (errDireccion) {
      return { ok: false, error: direccionError }
    }
  } else {
    // Empleado creado antes de que el formulario capturara dirección.
    const { data: nueva, error: errInsert } = await supabase
      .from('sgrh_direcciones')
      .insert(parsed.data.direccion)
      .select('dir_id')
      .single()

    if (errInsert || !nueva) {
      return { ok: false, error: direccionError }
    }

    const { error: errEnlace } = await supabase
      .from('sgrh_empleados')
      .update({ emp_direccion_id: nueva.dir_id })
      .eq('emp_id', empId)

    if (errEnlace) {
      return { ok: false, error: direccionError }
    }
  }

  if (parsed.data.datos_pago) {
    const { edp_numero_cuenta: cuenta, ...restoPago } = parsed.data.datos_pago

    // Omitir las dos columnas del payload las deja intactas: PostgREST solo
    // actualiza las que vienen en el objeto. Van juntas siempre — el constraint
    // edp_cuenta_hmac_pareado rechaza que una quede nula y la otra no.
    const payload = cuentaPreservada
      ? { edp_empleado_id: empId, ...restoPago }
      : {
          edp_empleado_id: empId,
          ...restoPago,
          edp_numero_cuenta: cuenta ? await encryptField(cuenta) : null,
          edp_cuenta_hmac: pago.hmac,
        }

    const { error: errPago } = await supabase
      .from('sgrh_empleado_datos_pago')
      .upsert(payload, { onConflict: 'edp_empleado_id' })

    if (errPago) {
      // 23514 acá es casi siempre edp_cuenta_hmac_pareado sobre una fila cifrada
      // ANTES de que existiera el índice ciego: el guard preservó el ciphertext
      // y el HMAC sigue nulo. Lo resuelve correr scripts/encrypt-payment-data.ts,
      // no el usuario, así que el mensaje apunta a soporte en vez de a reintentar.
      if (errPago.code === '23514') {
        return {
          ok: false,
          error:
            'Los datos personales se guardaron, pero la cuenta bancaria quedó pendiente de ' +
            'migración. Avisa a soporte antes de volver a intentarlo.',
        }
      }
      return {
        ok: false,
        error: 'Los datos personales se guardaron, pero los datos de pago no. Intenta de nuevo.',
      }
    }
  }

  revalidatePath('/employees')
  revalidatePath(`/employees/${empId}`)
  return cuentaPreservada ? { ok: true, warning: CUENTA_PRESERVADA } : { ok: true }
}
