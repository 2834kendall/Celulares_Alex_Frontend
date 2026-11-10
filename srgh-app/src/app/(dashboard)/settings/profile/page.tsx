import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { CARD } from '@/components/ui/styles'
import { getSelectorMarca } from '@/lib/empresa/contexto-activo'
import { getEmpresaLogoUrl } from '@/lib/empresa/get-empresa-logo'
import { getEmpresaShell } from '@/lib/empresa/get-empresa-shell'
import { getTerritorio } from '@/modules/employees/actions/getCatalogs'
import { getCompanyProfile } from '@/modules/settings/actions/getCompanyProfile'
import { updateEmpresaApariencia } from '@/modules/settings/actions/updateEmpresaApariencia'
import { getBrandSettings } from '@/modules/settings/brands/actions'
import { BrandsPanel } from '@/modules/settings/brands/BrandsPanel'
import { AppearanceForm } from '@/modules/settings/components/AppearanceForm'
import { CompanyProfilePanel } from '@/modules/settings/components/CompanyProfilePanel'
import { CompanyTabs } from '@/modules/settings/components/CompanyTabs'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'
import { DEFAULT_ACCENT, DEFAULT_SIDEBAR } from '@/modules/settings/lib/shellDefaults'

async function InformacionTab() {
  // El territorio es el catálogo global cacheado (getCatalogs): sale casi
  // siempre del Data Cache, no de la base.
  const [profile, territorio] = await Promise.all([getCompanyProfile(), getTerritorio()])
  if (!profile.ok || !territorio.ok) {
    return (
      <Alert size="md">
        {profile.ok ? 'No se pudo cargar el catálogo de provincias.' : profile.error}
      </Alert>
    )
  }
  return <CompanyProfilePanel profile={profile.data} territorio={territorio.data} />
}

/** Tema por defecto de la empresa: lo heredan las marcas que no personalizaron un color. */
async function AparienciaTab() {
  const [empresa, logoUrl] = await Promise.all([getEmpresaShell(), getEmpresaLogoUrl()])
  return (
    <div className={`${CARD} max-w-3xl p-5`}>
      <AppearanceForm
        descripcion="Son los colores de la app para quien no pertenece a una marca, y los heredan las marcas que no tienen colores propios."
        unsavedLabel="la apariencia de la empresa"
        colorAcentoActual={empresa?.org_color_acento ?? null}
        colorSidebarActual={empresa?.org_color_sidebar ?? null}
        heredados={{ acento: DEFAULT_ACCENT, sidebar: DEFAULT_SIDEBAR }}
        heredarLabel="Usar el del sistema"
        previewNombre={empresa?.org_nombre_fantasia ?? empresa?.org_nombre_social ?? 'Empresa'}
        previewLogoUrl={logoUrl}
        onSave={updateEmpresaApariencia}
      />
    </div>
  )
}

async function MarcasTab() {
  const [r, empresa, logoUrl, selector] = await Promise.all([
    getBrandSettings(),
    getEmpresaShell(),
    getEmpresaLogoUrl(),
    getSelectorMarca(),
  ])
  if (!r.ok) {
    return (
      <div className="space-y-4">
        <Alert>{r.error}</Alert>
        <Link href="/settings/profile?tab=marcas" className="text-brand-700 underline">
          Volver a intentar
        </Link>
      </div>
    )
  }
  return (
    <BrandsPanel
      data={r.data}
      empresa={{
        acento: empresa?.org_color_acento ?? DEFAULT_ACCENT,
        sidebar: empresa?.org_color_sidebar ?? DEFAULT_SIDEBAR,
        logoUrl,
      }}
      marcasElegibles={selector.marcas.map((marca) => marca.id)}
    />
  )
}

export default async function SettingsProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  // Solo visible con EMPRESAS_WRITE (lo mismo que exige empresas_update).
  const { section } = await requireSettingsSection('profile')
  const { tab } = await searchParams

  return (
    <SettingsSection section={section}>
      <CompanyTabs
        informacion={tab !== 'apariencia' && tab !== 'marcas' ? <InformacionTab /> : null}
        apariencia={tab === 'apariencia' ? <AparienciaTab /> : null}
        marcas={tab === 'marcas' ? <MarcasTab /> : null}
      />
    </SettingsSection>
  )
}
