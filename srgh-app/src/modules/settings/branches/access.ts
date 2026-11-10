import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'

export async function branchAdmin(kiosks = false) {
  const claims = await requirePermission(PERMISOS.EMPRESAS_WRITE)
  if (kiosks) await requirePermission(PERMISOS.USUARIOS_WRITE)
  const empresa = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresa || typeof claims.sub !== 'string')
    throw new Error('No se pudo verificar la empresa.')
  const admin = createAdminClient()
  const { error } = await admin.rpc('sgrh_assert_branch_admin', {
    p_actor: claims.sub,
    p_empresa: empresa,
    p_kioscos: kiosks,
  })
  if (error) throw new Error('No tenés acceso a esta configuración. Iniciá sesión de nuevo.')
  return { admin, empresa, actor: claims.sub, claims }
}
