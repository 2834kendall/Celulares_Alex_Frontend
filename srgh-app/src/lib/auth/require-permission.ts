import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Permiso } from '@/lib/permissions/catalog'
import type { SgrhJwtClaims } from '@/types/auth'

/**
 * Guards server-side por permiso. Se llaman al inicio de cada page.tsx protegida.
 * Leen los permisos del JWT via getClaims() — el hook de Supabase los inyecta
 * en el token, NO en el registro del usuario (getUser() no los trae).
 */
async function getSessionPermisos() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims) {
    redirect('/login')
  }

  const meta = (data.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  return { claims: data.claims, permisos }
}

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
