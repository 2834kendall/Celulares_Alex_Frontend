import { PERMISOS } from '@/lib/permissions/catalog'
import { Alert } from '@/components/ui/Alert'
import { getAusenciaTypes } from '@/modules/absences/actions/getAusenciaTypes'
import { TiposAusenciaList } from '@/modules/absences/components/TiposAusenciaList'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsScheduleAbsenceTypesPage() {
  const { section, permisos } = await requireSettingsSection('absence-types')
  // CATALOGOS_WRITE gobierna los catalogos, igual que en la RLS. Sin el, solo lectura.
  const canWrite = permisos.includes(PERMISOS.CATALOGOS_WRITE)
  const absenceTypes = await getAusenciaTypes()

  return (
    <SettingsSection section={section}>
      {absenceTypes.ok ? (
        <TiposAusenciaList tipos={absenceTypes.data} canWrite={canWrite} />
      ) : (
        <Alert size="md">{absenceTypes.error}</Alert>
      )}
    </SettingsSection>
  )
}
