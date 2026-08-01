import type { StorageErrorCode } from '@/lib/storage/types'

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
