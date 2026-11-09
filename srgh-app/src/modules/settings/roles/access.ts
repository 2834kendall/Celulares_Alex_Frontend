import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Guarda de todo el módulo de roles. Dos barreras, como `branchAdmin`:
 *
 * 1. ROLES_WRITE en el JWT (rápida, corta a quien ni debería ver la pantalla);
 * 2. la misma comprobación EN VIVO contra la base (`sgrh_assert_roles_admin`),
 *    porque el JWT puede tener hasta una hora y un permiso recién quitado
 *    seguiría ahí. Recién después se lee con el cliente admin.
 *
 * Las RPC de escritura vuelven a revalidar por su cuenta: esto no las
 * reemplaza, evita leer datos de administración con un permiso vencido.
 */
export async function rolesAdmin() {
  const claims = await requirePermission(PERMISOS.ROLES_WRITE)
  const empresa = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresa || typeof claims.sub !== 'string')
    throw new Error('No se pudo verificar la empresa.')
  const admin = createAdminClient()
  const { data: usrId, error } = await admin.rpc('sgrh_assert_roles_admin', {
    p_actor: claims.sub,
    p_empresa: empresa,
  })
  if (error) throw new Error('No tenés acceso a roles y permisos. Iniciá sesión de nuevo.')
  return { admin, empresa, actor: claims.sub, usrId }
}
