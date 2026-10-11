import { PERMISOS } from '@/lib/permissions/catalog'
import { Alert } from '@/components/ui/Alert'
import { listPuestos } from '@/modules/employees/actions/listPuestos'
import { PuestosList } from '@/modules/employees/components/PuestosList'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsEmployeesPositionsPage() {
  const { section, permisos } = await requireSettingsSection('positions')
  // CATALOGOS_WRITE gobierna todos los catalogos de la empresa, igual que en
  // la RLS. Sin el, la lista se ve en solo lectura.
  const canWrite = permisos.includes(PERMISOS.CATALOGOS_WRITE)
  const positions = await listPuestos()

  return (
    <SettingsSection section={section}>
      {positions.ok ? (
        <PuestosList puestos={positions.data} canWrite={canWrite} />
      ) : (
        <Alert size="md">{positions.error}</Alert>
      )}
    </SettingsSection>
  )
}
