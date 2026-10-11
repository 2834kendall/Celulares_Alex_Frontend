import { Alert } from '@/components/ui/Alert'
import { getTerritorio } from '@/modules/employees/actions/getCatalogs'
import { getCompanyProfile } from '@/modules/settings/actions/getCompanyProfile'
import { CompanyProfilePanel } from '@/modules/settings/components/CompanyProfilePanel'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsProfilePage() {
  // Solo visible con EMPRESAS_WRITE (lo mismo que exige empresas_update).
  const { section } = await requireSettingsSection('profile')
  // El territorio es el catálogo global cacheado (getCatalogs): sale casi
  // siempre del Data Cache, no de la base.
  const [profile, territorio] = await Promise.all([getCompanyProfile(), getTerritorio()])

  if (!profile.ok || !territorio.ok) {
    return (
      <SettingsSection section={section}>
        <Alert size="md">
          {profile.ok ? 'No se pudo cargar el catálogo de provincias.' : profile.error}
        </Alert>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection section={section}>
      <CompanyProfilePanel profile={profile.data} territorio={territorio.data} />
    </SettingsSection>
  )
}
