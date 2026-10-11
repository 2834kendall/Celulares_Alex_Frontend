import { Alert } from '@/components/ui/Alert'
import { getRubrosSeleccion } from '@/modules/recruitment/actions/getRubrosSeleccion'
import { RubrosSeleccionManager } from '@/modules/recruitment/components/RubrosSeleccionManager'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsRecruitmentCriteriaPage() {
  // Solo visible con CATALOGOS_WRITE, el mismo permiso que exige la acción de
  // abajo: sin él redirigiría la página entera.
  const { section } = await requireSettingsSection('criteria')
  const criteria = await getRubrosSeleccion()

  return (
    <SettingsSection section={section}>
      {criteria.ok ? (
        <RubrosSeleccionManager rubros={criteria.data} canWrite />
      ) : (
        <Alert size="md">{criteria.error}</Alert>
      )}
    </SettingsSection>
  )
}
