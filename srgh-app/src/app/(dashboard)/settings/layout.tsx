import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_CONFIGURACION } from '@/lib/permissions/zones'

/**
 * Configuración no tiene menú propio en la página: en /settings el sidebar
 * del AppShell pasa a "modo configuración" (SettingsSidebarNav) y el
 * contenido usa todo el ancho.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAnyPermission(ACCESO_CONFIGURACION)

  return <div className="mx-auto w-full max-w-5xl">{children}</div>
}
