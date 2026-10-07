import { PERMISOS } from '@/lib/permissions/catalog'
import { Alert } from '@/components/ui/Alert'
import { getTiposTardia } from '@/modules/attendance/actions/getTiposTardia'
import { TiposTardiaList } from '@/modules/attendance/components/TiposTardiaList'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsAttendanceTardinessTypesPage() {
  const { section, permisos } = await requireSettingsSection('tardiness-types')
  // CATALOGOS_WRITE gobierna todos los catalogos de la empresa, igual que en
  // la RLS. Sin el, la lista se ve en solo lectura.
  const canWrite = permisos.includes(PERMISOS.CATALOGOS_WRITE)
  const tardinessTypes = await getTiposTardia()

  return (
    <SettingsSection section={section}>
      {tardinessTypes.ok ? (
        <TiposTardiaList tipos={tardinessTypes.data} canWrite={canWrite} />
      ) : (
        <Alert size="md">{tardinessTypes.error}</Alert>
      )}
    </SettingsSection>
  )
}
