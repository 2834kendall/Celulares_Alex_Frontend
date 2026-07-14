'use server'

import { z } from 'zod'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  crearUsuarioEmpleadoSchema,
  type CrearUsuarioEmpleadoInput,
} from '@/modules/employees/types'

const inviteInputSchema = z.object({
  empId: z.number().int().positive(),
  usuario: crearUsuarioEmpleadoSchema,
})

export type InviteEmployeeUserResult = { ok: true; usrId: number } | { ok: false; error: string }

/**
 * Invita a un empleado como usuario del sistema (flujo de la arquitectura):
 * inviteUserByEmail crea el auth user y dispara el trigger handle_new_auth_user,
 * que crea/vincula la fila en sgrh_usuarios por email. Aquí solo queda ligar
 * el empleado y asignar el rol en la empresa del administrador.
 * Reutilizable desde el onboarding y desde la futura sub-área de usuarios.
 */
export async function inviteEmployeeUser(
  empId: number,
  usuario: CrearUsuarioEmpleadoInput
): Promise<InviteEmployeeUserResult> {
  const parsed = inviteInputSchema.safeParse({ empId, usuario })
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
  if (parsed.data.usuario.sucursal_id) {
    const { data: sucursal, error: sucError } = await admin
      .from('sgrh_sucursales')
      .select('suc_id')
      .eq('suc_id', parsed.data.usuario.sucursal_id)
      .eq('suc_empresa_id', empresaId)
      .maybeSingle()

    if (sucError || !sucursal) {
      return { ok: false, error: 'La sucursal seleccionada no es válida para tu empresa.' }
    }
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.usuario.email)

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

  const { data: usuarioRow, error: userError } = await admin
    .from('sgrh_usuarios')
    .update({ usr_empleado_id: parsed.data.empId })
    .eq('usr_email', parsed.data.usuario.email)
    .select('usr_id')
    .single()

  if (userError || !usuarioRow) {
    return {
      ok: false,
      error: 'La invitación se envió, pero no se pudo vincular el usuario al empleado.',
    }
  }

  const { error: uerError } = await admin.from('sgrh_usuarios_empresa_rol').insert({
    uer_usuario_id: usuarioRow.usr_id,
    uer_empresa_id: empresaId,
    uer_rol_id: parsed.data.usuario.rol_id,
    uer_sucursal_id: parsed.data.usuario.sucursal_id ?? null,
  })

  if (uerError) {
    return {
      ok: false,
      error: 'La invitación se envió, pero no se pudo asignar el rol al usuario.',
    }
  }

  return { ok: true, usrId: usuarioRow.usr_id }
}
