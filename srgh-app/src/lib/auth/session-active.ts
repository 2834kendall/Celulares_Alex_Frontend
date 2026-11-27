import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Verifica en Postgres si la sesión del JWT sigue vigente (`auth.sessions`,
 * usuario no baneado, `usr_activo = true` y asignación activa en la empresa
 * del token). Fail-closed ante cualquier error o respuesta inesperada.
 *
 * `cache`: memoiza la verificación durante el request de servidor para que
 * `DashboardLayout` y `requirePermission()` compartan una sola RPC.
 */
export const isSessionActive = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('sgrh_sesion_vigente')
    return !error && data === true
  } catch {
    return false
  }
})

/**
 * Lee los claims del JWT y, solo cuando hay sesión, confirma contra Postgres
 * que sigue vigente. Visitantes anónimos resuelven `null` sin viajar a BD.
 */
export const getActiveSessionClaims = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims) {
    return null
  }

  const active = await isSessionActive()
  if (!active) {
    return null
  }

  return data.claims
})
