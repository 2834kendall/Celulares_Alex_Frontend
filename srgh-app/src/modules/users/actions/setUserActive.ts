'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'
import { kioskAssignmentGuard } from '@/modules/users/lib/kioskAssignmentGuard'

export type SetUserActiveResult = { ok: true } | { ok: false; error: string }

// "Permanente" para Supabase Auth: ban_duration no acepta 'infinite', así que
// se usan 100 años. Reactivar aplica 'none' y levanta el ban.
const BAN_PERMANENTE = '876000h'

/**
 * Desactiva o reactiva el ACCESO de un usuario (no borra nada: la fila y su
 * rastro quedan para auditoría; el evento de negocio —despido, etc.— vive en
 * el historial laboral). Desactivar combina ban en Supabase Auth (cuando no
 * tiene otras empresas activas), `usr_activo` / `uer_activo` y revocación
 * inmediata de sesiones activas.
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

  // La fila uer de la empresa del JWT es también el guard cross-tenant. Un
  // usuario a cargo de varias sucursales tiene varias filas — se activan o
  // desactivan TODAS juntas, nunca solo una: el acceso es del usuario, no
  // de una sucursal en particular.
  const { data: asignaciones, error: uerReadError } = await admin
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_id')
    .eq('uer_usuario_id', usrId)
    .eq('uer_empresa_id', empresaId)

  if (uerReadError || !asignaciones || asignaciones.length === 0) {
    return { ok: false, error: 'Usuario no encontrado.' }
  }
  const kioskError = await kioskAssignmentGuard(admin, { usrId })
  if (kioskError) return { ok: false, error: kioskError }

  const { data: usuario, error: usrReadError } = await admin
    .from('sgrh_usuarios')
    .select('usr_auth_id')
    .eq('usr_id', usrId)
    .single()

  if (usrReadError || !usuario) {
    return { ok: false, error: 'Usuario no encontrado.' }
  }

  // En modelo multi-empresa, desactivar en una empresa NO debe banear
  // globalmente ni apagar `usr_activo` si conserva asignaciones activas en
  // otra empresa; sí se revocan sus sesiones para invalidar el JWT actual.
  let actualizarCuentaGlobal = true
  if (!active) {
    const { data: otrasEmpresas, error: otrasError } = await admin
      .from('sgrh_usuarios_empresa_rol')
      .select('uer_id')
      .eq('uer_usuario_id', usrId)
      .neq('uer_empresa_id', empresaId)
      .eq('uer_activo', true)
      .limit(1)

    if (otrasError) {
      return { ok: false, error: 'No se pudo actualizar el estado del usuario.' }
    }

    actualizarCuentaGlobal = (otrasEmpresas?.length ?? 0) === 0
  }

  // El ban va primero: si Auth falla no se tocan los flags y el estado queda
  // consistente. Un usuario pendiente sin auth user solo actualiza flags.
  if (actualizarCuentaGlobal && usuario.usr_auth_id) {
    const { error: banError } = await admin.auth.admin.updateUserById(usuario.usr_auth_id, {
      ban_duration: active ? 'none' : BAN_PERMANENTE,
    })

    if (banError) {
      return { ok: false, error: 'No se pudo actualizar el acceso del usuario.' }
    }
  }

  if (actualizarCuentaGlobal) {
    const { error: usrUpdateError } = await admin
      .from('sgrh_usuarios')
      .update({ usr_activo: active })
      .eq('usr_id', usrId)

    if (usrUpdateError) {
      return { ok: false, error: 'No se pudo actualizar el estado del usuario.' }
    }
  }

  const { error: uerUpdateError } = await admin
    .from('sgrh_usuarios_empresa_rol')
    .update({ uer_activo: active })
    .in(
      'uer_id',
      asignaciones.map((fila) => fila.uer_id)
    )

  if (uerUpdateError) {
    if (actualizarCuentaGlobal) revalidatePath('/employees')
    return { ok: false, error: 'No se pudo actualizar el estado del usuario.' }
  }

  if (!active && usuario.usr_auth_id) {
    const { error: revokeError } = await admin.rpc('sgrh_revoke_user_sessions', {
      p_auth: usuario.usr_auth_id,
    })

    if (revokeError) {
      revalidatePath('/employees')
      return { ok: false, error: 'No se pudieron cerrar las sesiones activas del usuario.' }
    }
  }

  revalidatePath('/employees')
  return { ok: true }
}
