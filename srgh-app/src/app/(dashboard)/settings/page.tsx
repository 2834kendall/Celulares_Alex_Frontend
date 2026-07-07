import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_CONFIGURACION } from '@/lib/permissions/zones'
import { ModulePlaceholder } from '@/components/ui/ModulePlaceholder'

export default async function SettingsPage() {
  await requireAnyPermission(ACCESO_CONFIGURACION)

  return (
    <ModulePlaceholder
      title="Configuracion"
      description="Empresa, sucursales, catalogos, roles y usuarios del sistema."
    />
  )
}
