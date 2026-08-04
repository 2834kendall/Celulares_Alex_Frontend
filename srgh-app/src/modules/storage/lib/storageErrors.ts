import { CONTAINERS } from '@/lib/storage/containers'
import type { StorageContainer, StorageErrorCode } from '@/lib/storage/types'

// lib/storage habla en códigos; este módulo traduce a mensajes de UI en
// español — mismo reparto que modules/employees/lib/dbErrors.ts.

const MENSAJES: Record<StorageErrorCode, string> = {
  NOT_FOUND: 'El archivo no existe o ya fue eliminado.',
  ALREADY_EXISTS: 'Ya existe un archivo con ese nombre.',
  TOO_LARGE: 'El archivo supera el tamaño máximo permitido.',
  INVALID_TYPE: 'El tipo de archivo no está permitido.',
  FORBIDDEN: 'No tienes permiso para acceder a este archivo.',
  UNKNOWN: 'No se pudo completar la operación con el archivo.',
}

export function storageErrorMessage(code: StorageErrorCode): string {
  return MENSAJES[code]
}

/** 5242880 → '5 MB'. Los contenedores usan múltiplos exactos de MB. */
function formatMaxSize(maxBytes: number): string {
  return `${Math.round(maxBytes / (1024 * 1024))} MB`
}

/** ['jpg','png','webp'] → 'JPG, PNG o WEBP'. */
function listarExtensiones(container: StorageContainer): string {
  const extensiones = [...new Set(Object.values(CONTAINERS[container].allowedMimeTypes))].map(
    (extension) => extension.toUpperCase()
  )
  if (extensiones.length <= 1) {
    return extensiones.join('')
  }
  return `${extensiones.slice(0, -1).join(', ')} o ${extensiones[extensiones.length - 1]}`
}

/**
 * Mensaje para la pre-validación en el navegador (los dropzones), DERIVADO de
 * la config del contenedor en vez de repetir el límite a mano: si mañana el
 * bucket pasa a 20 MB, el texto acompaña solo. Antes cada dropzone tenía su
 * propia copia con el número escrito duro, que podía quedar mintiendo.
 */
export function uploadValidationMessage(
  code: StorageErrorCode,
  container: StorageContainer
): string {
  if (code === 'TOO_LARGE') {
    return `El archivo no puede superar ${formatMaxSize(CONTAINERS[container].maxBytes)}.`
  }
  if (code === 'INVALID_TYPE') {
    return `Solo se permiten archivos ${listarExtensiones(container)}.`
  }
  return storageErrorMessage(code)
}
