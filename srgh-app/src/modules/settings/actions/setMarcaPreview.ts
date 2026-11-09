'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { MARCA_PREVIEW_COOKIE } from '@/lib/empresa/marca-preview'

export type SetMarcaPreviewResult = { ok: true } | { ok: false; error: string }

const idSchema = z.number().int().positive().nullable()

/**
 * Fija (o limpia, con `null`) la marca en preview del selector de la barra
 * superior. Ver marca-preview.ts: es SOLO tema, no cambia el alcance de
 * ningún dato.
 *
 * Exige EMPRESAS_WRITE, y el id que llega del cliente se revalida contra
 * `sgrh_marcas_comerciales` (la RLS ya lo acota a la propia empresa) antes de
 * guardarlo: nunca se confía ciegamente en lo que mandó el formulario.
 */
export async function setMarcaPreview(marcaId: number | null): Promise<SetMarcaPreviewResult> {
  if (!idSchema.safeParse(marcaId).success) {
    return { ok: false, error: 'Marca inválida.' }
  }

  await requirePermission(PERMISOS.EMPRESAS_WRITE)
  const store = await cookies()

  if (marcaId === null) {
    store.delete(MARCA_PREVIEW_COOKIE)
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_marcas_comerciales')
    .select('mco_id')
    .eq('mco_id', marcaId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, error: 'Esa marca no existe o no pertenece a tu empresa.' }
  }

  store.set(MARCA_PREVIEW_COOKIE, String(marcaId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Una preferencia de "estoy revisando esta marca ahora", no algo que deba
    // sobrevivir semanas.
    maxAge: 60 * 60 * 12,
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}
