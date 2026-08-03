'use server'

import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_LAB } from '@/lib/storage/containers'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'
import type { ArchivoLabItem } from '@/modules/storage/types'

export type ListLabFilesResult =
  { ok: true; items: ArchivoLabItem[] } | { ok: false; error: string }

/**
 * Lista los archivos del laboratorio de la empresa del JWT y los firma EN
 * LOTE (getSignedUrls): N archivos = 1 llamada al proveedor. Es el mismo
 * patrón que usará la fase 2 para los avatares en la lista de empleados.
 */
export async function listLabFiles(): Promise<ListLabFilesResult> {
  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id
  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const storage = getStorageProvider()
  // El prefijo sale del JWT: un usuario solo puede listar su propia empresa
  // (y la policy RLS del bucket lo garantiza aunque este código fallara).
  const listed = await storage.list('FOTOS_EMPLEADO', `${empresaId}/_lab`)
  if (!listed.ok) {
    return { ok: false, error: storageErrorMessage(listed.error) }
  }

  const paths = listed.data.map((object) => object.path)
  const signed = await storage.getSignedUrls('FOTOS_EMPLEADO', paths, TTL_LAB)
  if (!signed.ok) {
    return { ok: false, error: storageErrorMessage(signed.error) }
  }

  const items: ArchivoLabItem[] = listed.data
    .filter((object) => signed.data[object.path] !== undefined)
    .map((object) => ({
      path: object.path,
      url: signed.data[object.path],
      sizeBytes: object.sizeBytes,
      contentType: object.contentType,
      createdAt: object.createdAt,
    }))

  return { ok: true, items }
}
