import { redirect } from 'next/navigation'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_CONFIGURACION } from '@/lib/permissions/zones'
import {
  findVisibleLeaf,
  firstVisibleHref,
  type SettingsModuleId,
} from '@/modules/settings/lib/sections'
import type { SgrhJwtClaims } from '@/types/auth'

async function readPermisos() {
  const claims = await requireAnyPermission(ACCESO_CONFIGURACION)
  const meta = (claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  return { meta, permisos: meta.permisos ?? [] }
}

/**
 * Guard de cada subpágina de Configuración. Exige el acceso a la zona y que
 * el ajuste sea visible para el usuario; si no lo es (alguien escribió la
 * URL a mano), vuelve a /settings, que lo manda al primero que sí ve.
 *
 * Es la primera barrera, no la única: las acciones de cada catálogo exigen
 * su propio permiso y la RLS decide qué filas se leen.
 */
export async function requireSettingsSection(id: string) {
  const { meta, permisos } = await readPermisos()

  const section = findVisibleLeaf(id, permisos)
  if (!section) {
    redirect('/settings')
  }

  return { section, permisos, meta }
}

/**
 * Para las páginas índice (/settings y /settings/<módulo>): no tienen
 * contenido propio, abren el primer ajuste visible.
 */
export async function redirectToFirstSetting(moduleId?: SettingsModuleId): Promise<never> {
  const { permisos } = await readPermisos()
  // Apariencia es visible para todo el que entra a la zona, así que /settings
  // siempre tiene destino. Un módulo sin hojas visibles vuelve a /settings.
  redirect(firstVisibleHref(permisos, moduleId) ?? '/settings')
}
