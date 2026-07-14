'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { editarFichaEmpleadoSchema, type EditarFichaEmpleadoInput } from '@/modules/employees/types'
import { mapEmployeeUniqueError } from '@/modules/employees/lib/dbErrors'

export type UpdateEmployeeResult = { ok: true } | { ok: false; error: string }

/**
 * Edición de la ficha personal + datos de pago. Usa el cliente de sesión:
 * la RLS de sgrh_empleados pasa (el empleado ya tiene historial) y la de
 * sgrh_empleado_datos_pago exige EMPLEADOS_WRITE de la misma empresa.
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
  const { data, error } = await supabase
    .from('sgrh_empleados')
    .update(parsed.data.empleado)
    .eq('emp_id', empId)
    .select('emp_id')
    .single()

  if (error || !data) {
    const uniqueError = mapEmployeeUniqueError(error)
    if (uniqueError) {
      return { ok: false, error: uniqueError }
    }
    return { ok: false, error: 'No se pudo actualizar el empleado.' }
  }

  if (parsed.data.datos_pago) {
    const { error: errPago } = await supabase
      .from('sgrh_empleado_datos_pago')
      .upsert(
        { edp_empleado_id: empId, ...parsed.data.datos_pago },
        { onConflict: 'edp_empleado_id' }
      )

    if (errPago) {
      return {
        ok: false,
        error: 'Los datos personales se guardaron, pero los datos de pago no. Intenta de nuevo.',
      }
    }
  }

  revalidatePath('/employees')
  revalidatePath(`/employees/${empId}`)
  return { ok: true }
}
