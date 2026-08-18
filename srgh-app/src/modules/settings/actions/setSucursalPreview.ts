'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { SUCURSAL_PREVIEW_COOKIE } from '@/lib/empresa/sucursal-preview'

export type SetSucursalPreviewResult = { ok: true } | { ok: false; error: string }

/**
 * Fija (o limpia, con `sucursalId: null`) la sucursal en preview del
 * selector de la barra superior. Ver sucursal-preview.ts: es SOLO tema, no
 * cambia el alcance de ningun dato.
 *
 * Exige EMPRESAS_WRITE — el mismo permiso que ya gobierna
 * SucursalAppearancePanel ("ve TODAS las sucursales de su empresa aunque no
 * tenga una fija propia") — asi que quien no lo tiene ni siquiera puede
 * intentarlo, y el id que llega del cliente se revalida contra
 * `sgrh_sucursales` (RLS ya lo acota a la propia empresa) antes de guardarlo:
 * nunca se confia ciegamente en lo que mando el formulario.
 */
export async function setSucursalPreview(
  sucursalId: number | null
): Promise<SetSucursalPreviewResult> {
  await requirePermission(PERMISOS.EMPRESAS_WRITE)

  const store = await cookies()

  if (sucursalId === null) {
    store.delete(SUCURSAL_PREVIEW_COOKIE)
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_sucursales')
    .select('suc_id')
    .eq('suc_id', sucursalId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, error: 'Esa sucursal no existe o no pertenece a tu empresa.' }
  }

  store.set(SUCURSAL_PREVIEW_COOKIE, String(sucursalId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Vive lo que dura la sesion de trabajo, no la sesion de login: es una
    // preferencia de UI de "estoy revisando esta sucursal ahora", no algo
    // que deba sobrevivir semanas.
    maxAge: 60 * 60 * 12,
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}
