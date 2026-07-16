'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'

export type ResendInvitationResult = { ok: true } | { ok: false; error: string }

/**
 * Reenvía la invitación a un usuario PENDIENTE (nunca inició sesión).
 * inviteUserByEmail falla con email_exists para un auth user ya creado, así
 * que primero se desvincula (usr_auth_id = NULL) y se borra el auth user
 * pendiente; al re-invitar, el trigger handle_new_auth_user re-vincula la
 * fila por email (ON CONFLICT usr_email). Prohibido para usuarios que ya
 * entraron: borrar su auth user destruiría una identidad real.
 */
export async function resendInvitation(usrId: number): Promise<ResendInvitationResult> {
  if (!Number.isInteger(usrId) || usrId <= 0) {
    return { ok: false, error: 'Usuario no encontrado.' }
  }

  const claims = await requirePermission(PERMISOS.USUARIOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const admin = createAdminClient()

  // La fila uer de la empresa del JWT es también el guard cross-tenant.
  const { data: asignacion, error: uerReadError } = await admin
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_id')
    .eq('uer_usuario_id', usrId)
    .eq('uer_empresa_id', empresaId)
    .maybeSingle()

  if (uerReadError || !asignacion) {
    return { ok: false, error: 'Usuario no encontrado.' }
  }

  const { data: usuario, error: usrReadError } = await admin
    .from('sgrh_usuarios')
    .select('usr_email, usr_auth_id')
    .eq('usr_id', usrId)
    .single()

  if (usrReadError || !usuario) {
    return { ok: false, error: 'Usuario no encontrado.' }
  }

  if (usuario.usr_auth_id) {
    // La condición "pendiente" se verifica contra Auth (fuente de verdad de
    // los inicios de sesión), nunca contra usr_ultimo_acceso.
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(
      usuario.usr_auth_id
    )

    if (authError || !authData.user) {
      return { ok: false, error: 'No se pudo verificar el estado de la invitación.' }
    }

    if (authData.user.last_sign_in_at) {
      return {
        ok: false,
        error: 'Solo se puede reenviar la invitación a usuarios que nunca han iniciado sesión.',
      }
    }

    // Desvincular ANTES de borrar: si el delete falla a medias, la fila queda
    // huérfana pero re-vinculable por email en el siguiente intento.
    const { error: unlinkError } = await admin
      .from('sgrh_usuarios')
      .update({ usr_auth_id: null })
      .eq('usr_id', usrId)

    if (unlinkError) {
      return { ok: false, error: 'No se pudo reenviar la invitación.' }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(usuario.usr_auth_id)

    if (deleteError) {
      return { ok: false, error: 'No se pudo reenviar la invitación.' }
    }
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(usuario.usr_email)

  if (inviteError) {
    return { ok: false, error: 'No se pudo reenviar la invitación.' }
  }

  revalidatePath('/employees')
  return { ok: true }
}
