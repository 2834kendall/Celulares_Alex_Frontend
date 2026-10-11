import { Alert } from '@/components/ui/Alert'
import { getStageColumnsAdmin } from '@/modules/recruitment/actions/getStageColumnsAdmin'
import { StageColumnsManager } from '@/modules/recruitment/components/StageColumnsManager'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

/**
 * Las etapas de selección son las columnas del tablero de Reclutamiento
 * (SGRH-96). Se administran en dos lugares que hacen lo mismo: sobre el
 * propio tablero, o acá como lista — más cómoda cuando son muchas. Acá además
 * se ven las etapas desactivadas, que en el tablero no existen.
 */
export default async function SettingsRecruitmentStagesPage() {
  // Solo visible con CATALOGOS_WRITE, el mismo permiso que exige la acción de
  // abajo: sin él redirigiría la página entera.
  const { section } = await requireSettingsSection('stages')
  const stages = await getStageColumnsAdmin()

  return (
    <SettingsSection section={section}>
      {stages.ok ? (
        <StageColumnsManager stages={stages.data} inactive={stages.inactive} />
      ) : (
        <Alert size="md">{stages.error}</Alert>
      )}
    </SettingsSection>
  )
}
