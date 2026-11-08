import { getFormatoHora } from '@/lib/empresa/get-formato-hora'
import { getHorasAnularPago } from '@/lib/empresa/get-horas-anular-pago'
import { FormatoHoraForm } from '@/modules/settings/components/FormatoHoraForm'
import { PlazoAnulacionForm } from '@/modules/settings/components/PlazoAnulacionForm'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsGeneralPage() {
  const { section } = await requireSettingsSection('general')
  const [formatoHora, horasAnularPago] = await Promise.all([getFormatoHora(), getHorasAnularPago()])

  return (
    <SettingsSection section={section}>
      <div className="space-y-4">
        <FormatoHoraForm formatoActual={formatoHora} />
        <PlazoAnulacionForm horasActuales={horasAnularPago} />
      </div>
    </SettingsSection>
  )
}
