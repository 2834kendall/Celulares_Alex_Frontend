import type { StorageContainer } from '@/lib/storage/types'

// ─── Única fuente de verdad de qué es cada contenedor ────────────────────────
// Estos valores se replican en la migración SQL que crea el bucket
// (supabase/migrations/20260731120000_storage_bucket_fotos.sql): el bucket es
// el árbitro final (file_size_limit / allowed_mime_types), el código rechaza
// ANTES para dar un mensaje de error útil en vez de un 413 del proveedor.

export interface ContainerConfig {
  /** Nombre del bucket/contenedor REAL en el proveedor actual. */
  bucket: string
  maxBytes: number
  /** Lista blanca de MIME (nunca lista negra) + su extensión canónica. */
  allowedMimeTypes: Readonly<Record<string, string>>
}

export const CONTAINERS: Readonly<Record<StorageContainer, ContainerConfig>> = {
  FOTOS_EMPLEADO: {
    bucket: 'fotos-empleados',
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    },
  },
  // Documentos del expediente (fase 1B): PDF + imágenes (una incapacidad
  // fotografiada es un caso real). Nunca se sirven inline — solo descarga
  // forzada (TTL_DESCARGA + downloadAs). SVG prohibido en TODO contenedor.
  DOCUMENTOS_EMPLEADO: {
    bucket: 'documentos-empleados',
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    },
  },
} as const

// ─── TTL de URLs firmadas (segundos) — decisión consciente, no números sueltos ─
// Una URL firmada es un bearer token: quien la tenga, la usa. El TTL acota la
// ventana si se filtra (logs, Network tab compartida, referer).

/**
 * Fotos en listas/detalle: 1 h. Vive lo que una vista; se re-firma en cada
 * render del Server Component, así que expirar no rompe UX.
 */
export const TTL_FOTO = 3600

/**
 * Descargas de documentos (fase 1B): se pide al hacer clic y se consume al
 * instante — minimiza la exposición del enlace.
 */
export const TTL_DESCARGA = 60
