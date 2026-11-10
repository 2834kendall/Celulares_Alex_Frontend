import { createAdminClient } from '@/lib/supabase/admin'
import { cache } from 'react'

// Request-scoped only: repeated guards in one render share a read. A new
// recognition/options/save request always revalidates current access.
const readContext = cache(async (sub: string, empresa: number) =>
  createAdminClient().rpc('sgrh_kiosk_context', { p_auth: sub, p_empresa: empresa })
)

export type ManagedKioskMeta = {
  usr_id?: number
  empresa_id?: number
  sucursal_ids?: number[] | null
  kiosk_error?: string
  kiosk_denied?: boolean
  kiosk_context?: string
  kiosk_id?: string | null
}

/** Resolve every operation against current state, never a browser device UUID. */
export async function liveKioskMetadata(
  sub: string,
  meta: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const denied = (message: string, definitive = false) => ({
    ...meta,
    sucursal_ids: [],
    kiosk_error: message,
    kiosk_denied: definitive,
  })
  if (!Number.isInteger(meta.empresa_id))
    return denied('No se pudo determinar la empresa del kiosco.', true)
  try {
    const { data, error } = await readContext(sub, meta.empresa_id as number)
    if (error || !data || typeof data !== 'object' || Array.isArray(data))
      return denied('No se pudo comprobar el acceso del kiosco. Reintentá cuando haya conexión.')
    if (typeof data.error === 'string') return denied(data.error, true)
    if (
      !Array.isArray(data.sucursal_ids) ||
      data.sucursal_ids.length === 0 ||
      typeof data.kiosk_context !== 'string'
    )
      return denied('La configuración del kiosco no es válida.', true)
    return { ...meta, ...data }
  } catch {
    return denied('No se pudo comprobar el acceso del kiosco. Reintentá cuando haya conexión.')
  }
}
