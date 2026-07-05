import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Permiso } from '@/lib/permissions/catalog'
import type { SgrhJwtClaims } from '@/types/auth'

/**
 * Guard server-side por permiso. Se llama al inicio de cada page.tsx protegida.
 * Lee los permisos del JWT via getClaims() — el hook de Supabase los inyecta
 * en el token, NO en el registro del usuario (getUser() no los trae).
 */
export async function requirePermission(requiredPermission: Permiso) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims) {
    redirect('/login')
  }

  const meta = (data.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  if (!permisos.includes(requiredPermission)) {
    redirect('/unauthorized')
  }

  return data.claims
}
