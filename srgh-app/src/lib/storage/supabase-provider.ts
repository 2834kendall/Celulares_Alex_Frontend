import { createClient } from '@/lib/supabase/server'
import { CONTAINERS } from '@/lib/storage/containers'
import type {
  StorageErrorCode,
  StorageObject,
  StorageProvider,
  StorageResult,
} from '@/lib/storage/types'

// ─── Adapter de Supabase Storage — ÚNICO archivo que importa supabase.storage ─
// Si alguna vez aparece `.storage` fuera de este archivo, el desacople se
// rompió. Usa el cliente de SESIÓN (no el admin) a propósito: así las policies
// RLS de storage.objects se evalúan de verdad con el JWT del usuario — mismo
// principio que el resto de la app (el admin bypassa RLS y solo se usa para lo
// que el JWT ya autorizó).

interface SupabaseStorageError {
  message?: string
  status?: number
  statusCode?: string | number
}

/**
 * Supabase reporta el status a veces en `status` (number) y a veces en
 * `statusCode` (string) según la versión/operación; se normaliza aquí.
 */
function mapError(error: SupabaseStorageError | null): StorageErrorCode {
  const status = Number(error?.statusCode ?? error?.status ?? NaN)

  switch (status) {
    case 400:
      return 'INVALID_TYPE' // el bucket rechaza el MIME (allowed_mime_types)
    case 403:
      return 'FORBIDDEN' // RLS: sin permiso o path de otra empresa
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'ALREADY_EXISTS'
    case 413:
      return 'TOO_LARGE' // el bucket rechaza el tamaño (file_size_limit)
    default:
      return 'UNKNOWN'
  }
}

export function createSupabaseStorageProvider(): StorageProvider {
  return {
    async upload({ container, path, body, contentType, upsert = false }) {
      const supabase = await createClient()
      const { data, error } = await supabase.storage
        .from(CONTAINERS[container].bucket)
        .upload(path, body, { contentType, upsert })

      if (error || !data) {
        return { ok: false, error: mapError(error) }
      }
      return { ok: true, data: { path: data.path } }
    },

    async getSignedUrl(container, path, expiresInSeconds, options) {
      const supabase = await createClient()
      const { data, error } = await supabase.storage
        .from(CONTAINERS[container].bucket)
        .createSignedUrl(
          path,
          expiresInSeconds,
          options?.downloadAs ? { download: options.downloadAs } : undefined
        )

      if (error || !data?.signedUrl) {
        return { ok: false, error: mapError(error) }
      }
      return { ok: true, data: data.signedUrl }
    },

    async getSignedUrls(container, paths, expiresInSeconds) {
      if (paths.length === 0) {
        return { ok: true, data: {} }
      }

      const supabase = await createClient()
      // UNA llamada para N rutas: listar 50 empleados firma en 1 request.
      const { data, error } = await supabase.storage
        .from(CONTAINERS[container].bucket)
        .createSignedUrls(paths, expiresInSeconds)

      if (error || !data) {
        return { ok: false, error: mapError(error) }
      }

      const urls: Record<string, string> = {}
      for (const item of data) {
        // Las rutas que fallaron individualmente (borradas, ajenas) vienen con
        // error por-item y url null: se omiten en vez de tumbar el lote.
        if (item.path && item.signedUrl && !item.error) {
          urls[item.path] = item.signedUrl
        }
      }
      return { ok: true, data: urls }
    },

    async list(container, prefix) {
      const supabase = await createClient()
      // supabase-js lista por "carpeta" (no recursivo): el prefijo debe ser la
      // carpeta contenedora, y las rutas devueltas se reconstruyen completas.
      const { data, error } = await supabase.storage
        .from(CONTAINERS[container].bucket)
        .list(prefix, { sortBy: { column: 'created_at', order: 'desc' } })

      if (error || !data) {
        return { ok: false, error: mapError(error) }
      }

      const objects: StorageObject[] = data
        // Sin id = "carpeta" virtual del listado, no un objeto real.
        .filter((item) => item.id !== null)
        .map((item) => ({
          path: `${prefix}/${item.name}`,
          sizeBytes: item.metadata?.size ?? null,
          contentType: item.metadata?.mimetype ?? null,
          createdAt: item.created_at ?? null,
        }))
      return { ok: true, data: objects }
    },

    async remove(container, paths) {
      if (paths.length === 0) {
        return { ok: true, data: null } satisfies StorageResult<null>
      }

      const supabase = await createClient()
      const { error } = await supabase.storage.from(CONTAINERS[container].bucket).remove(paths)

      if (error) {
        return { ok: false, error: mapError(error) }
      }
      return { ok: true, data: null }
    },
  }
}
