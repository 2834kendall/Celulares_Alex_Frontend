'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { editarAsignacionSchema, type EditarAsignacionInput } from '@/modules/users/types'

export type UpdateUserAssignmentResult = { ok: true } | { ok: false; error: string }

/**
 * Edita rol/sucursal (fila uer) y el vínculo con el empleado. Los permisos del
 * JWT se calculan al login, así que el cambio de rol aplica en el PRÓXIMO
 * inicio de sesión del afectado (la UI lo avisa). No hay UNIQUE en
 * (usuario, empresa) y el hook JWT lee con LIMIT 1: siempre se actualiza la
 * fila existente, nunca se inserta una segunda.
 */
export async function updateUserAssignment(
  usrId: number,
  input: EditarAsignacionInput
): Promise<UpdateUserAssignmentResult> {
  if (!Number.isInteger(usrId) || usrId <= 0) {
    return { ok: false, error: 'Usuario no encontrado.' }
  }

  const parsed = editarAsignacionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos de la asignación inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.USUARIOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const admin = createAdminClient()

  // La fila uer de la empresa del JWT es también el guard cross-tenant: un
  // usuario de otra empresa simplemente no tiene asignación aquí.
  const { data: asignacion, error: uerReadError } = await admin
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_id')
    .eq('uer_usuario_id', usrId)
    .eq('uer_empresa_id', empresaId)
    .maybeSingle()

  if (uerReadError || !asignacion) {
    return { ok: false, error: 'Usuario no encontrado.' }
  }

  if (parsed.data.sucursal_id) {
    const { data: sucursal, error: sucError } = await admin
      .from('sgrh_sucursales')
      .select('suc_id')
      .eq('suc_id', parsed.data.sucursal_id)
      .eq('suc_empresa_id', empresaId)
      .maybeSingle()

    if (sucError || !sucursal) {
      return { ok: false, error: 'La sucursal seleccionada no es válida para tu empresa.' }
    }
  }

  if (parsed.data.empleado_id) {
    // El empleado se valida con el cliente de SESIÓN: RLS solo deja ver los de
    // la empresa del JWT, así que un emp_id ajeno simplemente no aparece.
    const supabase = await createClient()
    const { data: empleado, error: empError } = await supabase
      .from('sgrh_empleados')
      .select('emp_id')
      .eq('emp_id', parsed.data.empleado_id)
      .maybeSingle()

    if (empError || !empleado) {
      return { ok: false, error: 'El empleado seleccionado no es válido para tu empresa.' }
    }

    // Un empleado solo puede tener un usuario; se excluye al propio usuario
    // para permitir guardar sin cambiar el vínculo.
    const { data: otroUsuario, error: vinculoError } = await admin
      .from('sgrh_usuarios')
      .select('usr_id')
      .eq('usr_empleado_id', parsed.data.empleado_id)
      .neq('usr_id', usrId)
      .maybeSingle()

    if (vinculoError) {
      return { ok: false, error: 'No se pudo verificar el vínculo del empleado.' }
    }
    if (otroUsuario) {
      return { ok: false, error: 'Ese empleado ya está vinculado a otro usuario.' }
    }
  }

  const { error: uerUpdateError } = await admin
    .from('sgrh_usuarios_empresa_rol')
    .update({
      uer_rol_id: parsed.data.rol_id,
      uer_sucursal_id: parsed.data.sucursal_id ?? null,
    })
    .eq('uer_id', asignacion.uer_id)

  if (uerUpdateError) {
    return { ok: false, error: 'No se pudo actualizar la asignación del usuario.' }
  }

  const { error: usrUpdateError } = await admin
    .from('sgrh_usuarios')
    .update({ usr_empleado_id: parsed.data.empleado_id ?? null })
    .eq('usr_id', usrId)

  if (usrUpdateError) {
    return {
      ok: false,
      error: 'El rol se actualizó, pero no se pudo actualizar el vínculo con el empleado.',
    }
  }

  revalidatePath('/employees')
  return { ok: true }
}
