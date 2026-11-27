import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getActiveSessionClaims } from '@/lib/auth/session-active'
import { Permiso } from '@/lib/permissions/catalog'
import type { SgrhJwtClaims } from '@/types/auth'

/**
 * Guards server-side por permiso. Se llaman al inicio de cada page.tsx protegida
 * y de cada Server Action autenticada. Validan tanto los claims del JWT como la
 * vigencia de la sesión en BD (`getActiveSessionClaims`).
 *
 * `cache`: una página con N acciones de catálogo verifica la sesión una sola vez
 * por request. Solo se memoiza la lectura de la sesión; la decisión de cada
 * guard se evalúa en cada llamada.
 */
const getSessionPermisos = cache(async () => {
  const claims = await getActiveSessionClaims()

  if (!claims) {
    redirect('/login')
  }

  const meta = (claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  return { claims, permisos }
})

/** Exige UN permiso especifico. */
export async function requirePermission(requiredPermission: Permiso) {
  const { claims, permisos } = await getSessionPermisos()

  if (!permisos.includes(requiredPermission)) {
    redirect('/unauthorized')
  }

  return claims
}

/** Exige AL MENOS UNO de los permisos dados (zonas con acceso multiple). */
export async function requireAnyPermission(requiredPermissions: Permiso[]) {
  const { claims, permisos } = await getSessionPermisos()

  if (!requiredPermissions.some((permiso) => permisos.includes(permiso))) {
    redirect('/unauthorized')
  }

  return claims
}
