'use server'

import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_LAB } from '@/lib/storage/containers'
import { pathBelongsToEmpresa } from '@/lib/storage/paths'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type GetLabFileUrlResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Firma una URL fresca para un archivo del lab (p. ej. cuando la de la lista
 * ya expiró). El path viene del CLIENTE, así que se verifica contra la
 * empresa del JWT ANTES de tocar el proveedor — doble candado con la RLS.
 */
export async function getLabFileUrl(path: string): Promise<GetLabFileUrlResult> {
  if (typeof path !== 'string' || path.trim() === '') {
    return { ok: false, error: 'Archivo inválido.' }
  }

  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  if (!pathBelongsToEmpresa(path, empresaId)) {
    return { ok: false, error: storageErrorMessage('FORBIDDEN') }
  }

  const result = await getStorageProvider().getSignedUrl('FOTOS_EMPLEADO', path, TTL_LAB)
  if (!result.ok) {
    return { ok: false, error: storageErrorMessage(result.error) }
  }

  return { ok: true, url: result.data }
}
