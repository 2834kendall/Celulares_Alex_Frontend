'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { buildCompanyLogoPath } from '@/lib/storage/paths'
import { validateUpload } from '@/lib/storage/validation'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type SetCompanyLogoResult = { ok: true } | { ok: false; error: string }

/**
 * Sube y asigna el logo de la empresa del JWT. Mismo orden que
 * setEmployeePhoto: 1) validar por magic bytes (jamás file.type), 2) subir,
 * 3) escribir la ruta en sgrh_empresas — si eso falla se revierte el upload,
 * 4) borrar el logo anterior best-effort (un huérfano en un bucket privado no
 * expone nada).
 *
 * La ruta se arma SIEMPRE con el empresa_id del JWT: la policy del bucket
 * compara el primer segmento contra get_empresa_id().
 */
export async function setCompanyLogo(formData: FormData): Promise<SetCompanyLogoResult> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona un archivo.' }
  }

  const claims = await requirePermission(PERMISOS.EMPRESAS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = validateUpload(bytes, 'LOGO_EMPRESA')
  if (!check.ok) {
    return { ok: false, error: storageErrorMessage(check.error) }
  }

  const supabase = await createClient()
  // La RLS (empresas_select) solo deja ver la fila del JWT.
  const { data: empresa, error: empresaError } = await supabase
    .from('sgrh_empresas')
    .select('org_id, org_logo_url')
    .maybeSingle()

  if (empresaError || !empresa) {
    return { ok: false, error: 'No se encontró la empresa.' }
  }

  const provider = getStorageProvider()
  const uploaded = await provider.upload({
    container: 'LOGO_EMPRESA',
    path: buildCompanyLogoPath(empresaId, check.extension),
    body: bytes,
    contentType: check.mimeType,
  })

  if (!uploaded.ok) {
    return { ok: false, error: storageErrorMessage(uploaded.error) }
  }

  const newPath = uploaded.data.path

  const { error: updateError } = await supabase
    .from('sgrh_empresas')
    .update({ org_logo_url: newPath })
    .eq('org_id', empresa.org_id)

  if (updateError) {
    // Nadie llegó a referenciar el objeto recién subido: se revierte.
    await provider.remove('LOGO_EMPRESA', [newPath])
    return { ok: false, error: 'No se pudo guardar el logo.' }
  }

  if (empresa.org_logo_url) {
    const removed = await provider.remove('LOGO_EMPRESA', [empresa.org_logo_url])
    if (!removed.ok) {
      console.error(
        `setCompanyLogo: no se pudo borrar el logo anterior (path=${empresa.org_logo_url})`
      )
    }
  }

  // El logo se ve en el menú de toda la app.
  revalidatePath('/', 'layout')
  return { ok: true }
}
