import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_CONFIGURACION } from '@/lib/permissions/zones'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSucursalTema } from '@/lib/empresa/get-sucursal-tema'
import { resolveShellTheme } from '@/lib/empresa/resolve-shell-theme'
import { getPuestos } from '@/modules/settings/actions/getPuestos'
import { SucursalAppearanceForm } from '@/modules/settings/components/SucursalAppearanceForm'
import { SucursalAppearancePanel } from '@/modules/settings/components/SucursalAppearancePanel'
import { PuestosList } from '@/modules/settings/components/PuestosList'
import { SettingsTabs } from '@/modules/settings/components/SettingsTabs'
import { Alert } from '@/components/ui/Alert'
import type { SgrhJwtClaims } from '@/types/auth'

export default async function SettingsPage() {
  const claims = await requireAnyPermission(ACCESO_CONFIGURACION)
  const meta = (claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = meta.permisos ?? []
  // EMPRESAS_WRITE = administra la EMPRESA (todas sus sucursales), no solo
  // la propia — la misma que RLS exige para el UPDATE de `sgrh_sucursales`.
  // Tenga o no ademas una sucursal fija asignada, ve y elige entre TODAS.
  const administraEmpresa = permisos.includes(PERMISOS.EMPRESAS_WRITE)
  const puedeEditarPuestos = permisos.includes(PERMISOS.CATALOGOS_WRITE)

  // `tema` es la sucursal FIJA propia del usuario (para saber cual
  // preseleccionar en el panel). `theme` es el tema OFICIAL que el shell
  // esta pintando AHORA — sucursal fija, salvo que haya una en preview desde
  // el selector de la barra superior — y es a lo que hay que restaurar el
  // shell cuando se sale del formulario de apariencia (ver
  // SucursalAppearanceForm). Sin esto ultimo, cambiar de tarjeta o de pagina
  // dejaba pegado el color de PRUEBA de lo ultimo editado, ignorando lo que
  // decia el selector de arriba.
  const [tema, theme, puestosResult] = await Promise.all([
    getSucursalTema(meta.usr_id ?? null),
    resolveShellTheme(meta.usr_id ?? null, permisos),
    getPuestos(),
  ])

  const sucursales = theme.sucursales

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500">
          Empresa, sucursales, catálogos, roles y usuarios del sistema.
        </p>
      </div>

      <SettingsTabs
        aparienciaContent={
          administraEmpresa ? (
            <SucursalAppearancePanel
              sucursales={sucursales}
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
          )
        }
        puestosContent={
          puestosResult.ok ? (
            <PuestosList puestos={puestosResult.data} canWrite={puedeEditarPuestos} />
          ) : (
            <Alert size="md">{puestosResult.error}</Alert>
          )
        }
      />
    </div>
  )
}
