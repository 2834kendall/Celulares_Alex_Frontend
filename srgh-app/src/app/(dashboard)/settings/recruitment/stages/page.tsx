import { Alert } from '@/components/ui/Alert'
import { getEtapasSeleccionAdmin } from '@/modules/recruitment/actions/getEtapasSeleccionAdmin'
import { EtapasSeleccionManager } from '@/modules/recruitment/components/EtapasSeleccionManager'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsRecruitmentStagesPage() {
  // Solo visible con CATALOGOS_WRITE, el mismo permiso que exige la acción de
  // abajo: sin él redirigiría la página entera.
  const { section } = await requireSettingsSection('stages')
  const stages = await getEtapasSeleccionAdmin()

  return (
    <SettingsSection section={section}>
      {stages.ok ? (
        <EtapasSeleccionManager etapas={stages.data} canWrite />
      ) : (
        <Alert size="md">{stages.error}</Alert>
      )}
    </SettingsSection>
  )
}
