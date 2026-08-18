import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_CONFIGURACION } from '@/lib/permissions/zones'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSucursalTema } from '@/lib/empresa/get-sucursal-tema'
import { listSucursalesConApariencia } from '@/lib/empresa/list-sucursales'
import { SucursalAppearanceForm } from '@/modules/settings/components/SucursalAppearanceForm'
import { SucursalAppearancePanel } from '@/modules/settings/components/SucursalAppearancePanel'
import type { SgrhJwtClaims } from '@/types/auth'

export default async function SettingsPage() {
  const claims = await requireAnyPermission(ACCESO_CONFIGURACION)
  const meta = (claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  // EMPRESAS_WRITE = administra la EMPRESA (todas sus sucursales), no solo
  // la propia — la misma que RLS exige para el UPDATE de `sgrh_sucursales`.
  // Tenga o no ademas una sucursal fija asignada, ve y elige entre TODAS.
  const administraEmpresa = (meta.permisos ?? []).includes(PERMISOS.EMPRESAS_WRITE)
  const tema = await getSucursalTema(meta.usr_id ?? null)

  const sucursales = administraEmpresa ? await listSucursalesConApariencia() : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500">
          Empresa, sucursales, catálogos, roles y usuarios del sistema.
        </p>
      </div>

      {administraEmpresa ? (
        <SucursalAppearancePanel sucursales={sucursales} sucursalIdInicial={tema.sucursalId} />
      ) : tema.sucursalId && tema.sucursalNombre ? (
        <SucursalAppearanceForm
          sucursalNombre={tema.sucursalNombre}
          colorAcentoActual={tema.colorAcento}
          colorSidebarActual={tema.colorSidebar}
        />
      ) : (
        <p className="max-w-md text-sm text-slate-500">
          No tenés una sucursal asignada para personalizar su apariencia.
        </p>
      )}
    </div>
  )
}
