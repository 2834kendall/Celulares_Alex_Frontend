import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

/** Generic user management must not bypass the kiosk-specific controls. */
export async function kioskAssignmentGuard(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    usrId?: number
    rolId?: number
    sucursalIds?: number[]
    empleadoId?: number | null
    inviting?: boolean
  }
) {
  if (args.usrId) {
    const registered = await admin
      .from('sgrh_kioscos')
      .select('kio_id')
      .eq('kio_usuario_id', args.usrId)
      .maybeSingle()
    if (registered.error) return 'No se pudo comprobar si la cuenta pertenece a un kiosco.'
    if (registered.data)
      return 'Este acceso pertenece a un kiosco. Administralo desde Configuración → Sucursales y kioscos.'
  }
  if (args.rolId) {
    const role = await admin
      .from('sgrh_cat_roles')
      .select('rol_id')
      .eq('rol_codigo', 'KIOSCO')
      .maybeSingle()
    if (role.error) return 'No se pudo validar el rol.'
    if (role.data?.rol_id === args.rolId) {
      if (args.inviting)
        return 'Registrá la cuenta KIOSCO desde Configuración → Sucursales y kioscos.'
      await requirePermission(PERMISOS.EMPRESAS_WRITE)
      if (args.sucursalIds?.length !== 1 || args.empleadoId)
        return 'Una cuenta KIOSCO debe tener una sola sucursal y no puede vincularse a un empleado.'
    }
  }
  return null
}
