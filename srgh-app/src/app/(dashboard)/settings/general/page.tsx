import { getFormatoHora } from '@/lib/empresa/get-formato-hora'
import { FormatoHoraForm } from '@/modules/settings/components/FormatoHoraForm'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsGeneralPage() {
  const { section } = await requireSettingsSection('general')
  const formatoHora = await getFormatoHora()

  return (
    <SettingsSection section={section}>
      <FormatoHoraForm formatoActual={formatoHora} />
    </SettingsSection>
  )
}
