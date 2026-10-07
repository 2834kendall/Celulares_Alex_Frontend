import { PERMISOS } from '@/lib/permissions/catalog'
import { getSucursalTema } from '@/lib/empresa/get-sucursal-tema'
import { resolveShellTheme } from '@/lib/empresa/resolve-shell-theme'
import { SucursalAppearanceForm } from '@/modules/settings/components/SucursalAppearanceForm'
import { SucursalAppearancePanel } from '@/modules/settings/components/SucursalAppearancePanel'
import { SettingsSection } from '@/modules/settings/components/SettingsSection'
import { requireSettingsSection } from '@/modules/settings/lib/requireSection'

export default async function SettingsAppearancePage() {
  const { section, permisos, meta } = await requireSettingsSection('appearance')
  // EMPRESAS_WRITE = administra la EMPRESA (todas sus sucursales), no solo
  // la propia — la misma que RLS exige para el UPDATE de `sgrh_sucursales`.
  // Tenga o no ademas una sucursal fija asignada, ve y elige entre TODAS.
  const administraEmpresa = permisos.includes(PERMISOS.EMPRESAS_WRITE)

  // `tema` es la sucursal FIJA propia del usuario (para saber cual
  // preseleccionar en el panel). `theme` es el tema OFICIAL que el shell
  // esta pintando AHORA — sucursal fija, salvo que haya una en preview desde
  // el selector de la barra superior — y es a lo que hay que restaurar el
  // shell cuando se sale del formulario de apariencia (ver
  // SucursalAppearanceForm). Sin esto ultimo, cambiar de tarjeta o de pagina
  // dejaba pegado el color de PRUEBA de lo ultimo editado, ignorando lo que
  // decia el selector de arriba.
  const [tema, theme] = await Promise.all([
    getSucursalTema(meta.usr_id ?? null),
    resolveShellTheme(meta.usr_id ?? null, permisos),
  ])

  return (
    <SettingsSection section={section}>
      {administraEmpresa ? (
        <SucursalAppearancePanel
          sucursales={theme.sucursales}
          sucursalIdInicial={tema.sucursalId}
          officialColorAcento={theme.colorAcento}
          officialColorSidebar={theme.colorSidebar}
        />
      ) : tema.sucursalId && tema.sucursalNombre ? (
        <SucursalAppearanceForm
          sucursalNombre={tema.sucursalNombre}
          colorAcentoActual={tema.colorAcento}
          colorSidebarActual={tema.colorSidebar}
          officialColorAcento={theme.colorAcento}
          officialColorSidebar={theme.colorSidebar}
        />
      ) : (
        <p className="max-w-md text-sm text-slate-500">
          No tenés una sucursal asignada para personalizar su apariencia.
        </p>
      )}
    </SettingsSection>
  )
}
