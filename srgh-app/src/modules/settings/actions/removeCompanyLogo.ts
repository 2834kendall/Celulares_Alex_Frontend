'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'

export type RemoveCompanyLogoResult = { ok: true } | { ok: false; error: string }

/**
 * Quita el logo de la empresa del JWT. Primero se suelta la referencia en
 * sgrh_empresas (la fuente de verdad) y después se borra el objeto
 * best-effort: si el borrado falla queda un huérfano en un bucket privado,
 * pero el menú ya vuelve a mostrar la inicial.
 */
export async function removeCompanyLogo(): Promise<RemoveCompanyLogoResult> {
  await requirePermission(PERMISOS.EMPRESAS_WRITE)

  const supabase = await createClient()
  const { data: empresa, error: empresaError } = await supabase
    .from('sgrh_empresas')
    .select('org_id, org_logo_url')
    .maybeSingle()

  if (empresaError || !empresa) {
    return { ok: false, error: 'No se encontró la empresa.' }
  }

  if (!empresa.org_logo_url) {
    return { ok: true }
  }

  const { error: updateError } = await supabase
    .from('sgrh_empresas')
    .update({ org_logo_url: null })
    .eq('org_id', empresa.org_id)

  if (updateError) {
    return { ok: false, error: 'No se pudo quitar el logo.' }
  }

  const removed = await getStorageProvider().remove('LOGO_EMPRESA', [empresa.org_logo_url])
  if (!removed.ok) {
    console.error(`removeCompanyLogo: no se pudo borrar el objeto (path=${empresa.org_logo_url})`)
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
