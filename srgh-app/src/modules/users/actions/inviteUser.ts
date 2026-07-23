'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { invitarUsuarioSchema, type InvitarUsuarioInput } from '@/modules/users/types'

export type InviteUserResult = { ok: true; usrId: number } | { ok: false; error: string }

/**
 * Invita un usuario del sistema (flujo de la arquitectura): inviteUserByEmail
 * crea el auth user y dispara el trigger handle_new_auth_user, que crea o
 * re-vincula la fila en sgrh_usuarios por email. Aquí solo queda asignar el
 * rol en la empresa del administrador y, si viene, ligar el empleado.
 * La llaman el paso 3 del onboarding de empleados y el tab de usuarios.
 */
export async function inviteUser(input: InvitarUsuarioInput): Promise<InviteUserResult> {
  const parsed = invitarUsuarioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del usuario inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.USUARIOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const admin = createAdminClient()

  // El cliente admin bypasea RLS: la pertenencia de la sucursal a la empresa
  // del JWT se valida explícitamente, y ANTES de crear el auth user para no
  // dejar invitaciones enviadas sobre un payload inválido.
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

    // Un empleado solo puede tener un usuario (usr_empleado_id).
    const { data: yaVinculado, error: vinculoError } = await admin
      .from('sgrh_usuarios')
      .select('usr_id')
      .eq('usr_empleado_id', parsed.data.empleado_id)
      .maybeSingle()

    if (vinculoError) {
      return { ok: false, error: 'No se pudo verificar el vínculo del empleado.' }
    }
    if (yaVinculado) {
      return { ok: false, error: 'Ese empleado ya tiene un usuario en el sistema.' }
    }
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email)

  if (inviteError) {
    const emailExists =
      inviteError.code === 'email_exists' || /already/i.test(inviteError.message ?? '')
    return {
      ok: false,
      error: emailExists
        ? 'Ese correo ya tiene un usuario en el sistema.'
        : 'No se pudo enviar la invitación.',
    }
  }

  // El trigger ya creó/re-vinculó la fila; se liga el empleado (si viene) y se
  // recupera el usr_id en la misma operación.
  const { data: usuarioRow, error: userError } = await admin
    .from('sgrh_usuarios')
    .update({ usr_empleado_id: parsed.data.empleado_id ?? null, usr_activo: true })
    .eq('usr_email', parsed.data.email)
    .select('usr_id')
    .single()

  if (userError || !usuarioRow) {
    return {
      ok: false,
      error: 'La invitación se envió, pero no se pudo vincular el usuario al empleado.',
    }
  }

  // El hook del JWT lee la fila uer con LIMIT 1 y no hay UNIQUE en
  // (usuario, empresa): si ya existe una asignación (fila huérfana re-vinculada
  // por el trigger), se ACTUALIZA en lugar de insertar una segunda.
  const { data: uerExistente, error: uerReadError } = await admin
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_id')
    .eq('uer_usuario_id', usuarioRow.usr_id)
    .eq('uer_empresa_id', empresaId)
    .maybeSingle()

  if (uerReadError) {
    return {
      ok: false,
      error: 'La invitación se envió, pero no se pudo asignar el rol al usuario.',
    }
  }

  const uerError = uerExistente
    ? (
        await admin
          .from('sgrh_usuarios_empresa_rol')
          .update({
            uer_rol_id: parsed.data.rol_id,
            uer_sucursal_id: parsed.data.sucursal_id ?? null,
            uer_activo: true,
          })
          .eq('uer_id', uerExistente.uer_id)
      ).error
    : (
        await admin.from('sgrh_usuarios_empresa_rol').insert({
          uer_usuario_id: usuarioRow.usr_id,
          uer_empresa_id: empresaId,
          uer_rol_id: parsed.data.rol_id,
          uer_sucursal_id: parsed.data.sucursal_id ?? null,
        })
      ).error

  if (uerError) {
    return {
      ok: false,
      error: 'La invitación se envió, pero no se pudo asignar el rol al usuario.',
    }
  }

  revalidatePath('/employees')
  return { ok: true, usrId: usuarioRow.usr_id }
}
