// ─── Port de storage — contrato agnóstico del proveedor ──────────────────────
// Supabase Storage es la implementación de HOY, no el contrato. Este archivo
// no importa nada de Supabase a propósito: el resto del código depende solo de
// esta interfaz, y cambiar de proveedor (S3/R2/Azure) es escribir otro adapter
// que la cumpla (ver getStorageProvider en index.ts).
//
// Reglas del contrato:
// * Nunca cruza un File ni un cliente del proveedor: entran bytes y un
//   contenedor LÓGICO; salen rutas y URLs como strings opacos.
// * El código de negocio jamás nombra un bucket real — el mapeo contenedor
//   lógico → bucket vive en containers.ts.

/** Contenedores lógicos. El mapeo a buckets reales vive en containers.ts. */
export type StorageContainer = 'FOTOS_EMPLEADO' | 'DOCUMENTOS_EMPLEADO'

/**
 * Códigos de error del port. lib/ habla en códigos; los mensajes en español
 * viven en el módulo (modules/storage/lib/storageErrors.ts), siguiendo el
 * precedente de modules/employees/lib/dbErrors.ts.
 */
export type StorageErrorCode =
  'NOT_FOUND' | 'ALREADY_EXISTS' | 'TOO_LARGE' | 'INVALID_TYPE' | 'FORBIDDEN' | 'UNKNOWN'

export type StorageResult<T> = { ok: true; data: T } | { ok: false; error: StorageErrorCode }

/** Metadatos mínimos de un objeto listado — lo que cualquier proveedor puede dar. */
export interface StorageObject {
  /** Ruta completa dentro del contenedor (incluye el prefijo de empresa). */
  path: string
  /** Tamaño en bytes; null si el proveedor no lo reporta en el listado. */
  sizeBytes: number | null
  /** MIME almacenado; null si el proveedor no lo reporta en el listado. */
  contentType: string | null
  /** ISO 8601; null si el proveedor no lo reporta. */
  createdAt: string | null
}

export interface StorageProvider {
  upload(input: {
    container: StorageContainer
    path: string
    /** Nunca File: el navegador no cruza esta frontera. */
    body: Uint8Array
    contentType: string
    upsert?: boolean
  }): Promise<StorageResult<{ path: string }>>

  /** Firma UNA ruta. downloadAs fuerza descarga con ese nombre (fase 1B). */
  getSignedUrl(
    container: StorageContainer,
    path: string,
    expiresInSeconds: number,
    options?: { downloadAs?: string }
  ): Promise<StorageResult<string>>

  /**
   * Firma N rutas del mismo contenedor en UNA llamada al proveedor. Clave para
   * listas (avatares en fase 2): 50 empleados = 1 request, no 50.
   */
  getSignedUrls(
    container: StorageContainer,
    paths: string[],
    expiresInSeconds: number
  ): Promise<StorageResult<Record<string, string>>>

  list(container: StorageContainer, prefix: string): Promise<StorageResult<StorageObject[]>>

  remove(container: StorageContainer, paths: string[]): Promise<StorageResult<null>>
}
