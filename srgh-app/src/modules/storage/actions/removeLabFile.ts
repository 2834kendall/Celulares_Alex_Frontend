'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { pathBelongsToEmpresa } from '@/lib/storage/paths'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

export type RemoveLabFileResult = { ok: true } | { ok: false; error: string }

/**
 * Borra un archivo del laboratorio. El path viene del CLIENTE: se verifica
 * contra la empresa del JWT antes de tocar el proveedor (la policy DELETE del
 * bucket es el segundo candado).
 */
export async function removeLabFile(path: string): Promise<RemoveLabFileResult> {
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

  const result = await getStorageProvider().remove('FOTOS_EMPLEADO', [path])
  if (!result.ok) {
    return { ok: false, error: storageErrorMessage(result.error) }
  }

  revalidatePath('/settings/storage-lab')
  return { ok: true }
}
