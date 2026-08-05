'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'

export type SetUserActiveResult = { ok: true } | { ok: false; error: string }

// "Permanente" para Supabase Auth: ban_duration no acepta 'infinite', así que
// se usan 100 años. Reactivar aplica 'none' y levanta el ban.
const BAN_PERMANENTE = '876000h'

/**
 * Desactiva o reactiva el ACCESO de un usuario (no borra nada: la fila y su
 * rastro quedan para auditoría; el evento de negocio —despido, etc.— vive en
 * el historial laboral). Desactivar combina las tres capas: ban en Supabase
 * Auth (corta el login de inmediato) + usr_activo + uer_activo.
 */
export async function setUserActive(usrId: number, active: boolean): Promise<SetUserActiveResult> {
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
    .select('usr_auth_id')
    .eq('usr_id', usrId)
    .single()

  if (usrReadError || !usuario) {
    return { ok: false, error: 'Usuario no encontrado.' }
  }

  // El ban va primero: si Auth falla no se tocan los flags y el estado queda
  // consistente. Un usuario pendiente sin auth user solo actualiza flags.
  if (usuario.usr_auth_id) {
    const { error: banError } = await admin.auth.admin.updateUserById(usuario.usr_auth_id, {
      ban_duration: active ? 'none' : BAN_PERMANENTE,
    })

    if (banError) {
      return { ok: false, error: 'No se pudo actualizar el acceso del usuario.' }
    }
  }

  const { error: usrUpdateError } = await admin
    .from('sgrh_usuarios')
    .update({ usr_activo: active })
    .eq('usr_id', usrId)

  if (usrUpdateError) {
    return { ok: false, error: 'No se pudo actualizar el estado del usuario.' }
  }

  const { error: uerUpdateError } = await admin
    .from('sgrh_usuarios_empresa_rol')
    .update({ uer_activo: active })
    .eq('uer_id', asignacion.uer_id)

  if (uerUpdateError) {
    return { ok: false, error: 'No se pudo actualizar el estado del usuario.' }
  }

  revalidatePath('/employees')
  return { ok: true }
}
