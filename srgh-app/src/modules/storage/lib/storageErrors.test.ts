import { describe, expect, it } from 'vitest'
import { storageErrorMessage, uploadValidationMessage } from './storageErrors'
import { CONTAINERS } from '@/lib/storage/containers'
import type { StorageErrorCode } from '@/lib/storage/types'

describe('storageErrorMessage', () => {
  it.each<StorageErrorCode>([
    'NOT_FOUND',
    'ALREADY_EXISTS',
    'TOO_LARGE',
    'INVALID_TYPE',
    'FORBIDDEN',
    'UNKNOWN',
  ])('todo código %s tiene mensaje en español con punto final', (code) => {
    const mensaje = storageErrorMessage(code)
    expect(mensaje.length).toBeGreaterThan(0)
    expect(mensaje.endsWith('.')).toBe(true)
  })
})

describe('uploadValidationMessage', () => {
  it('el tamaño sale de la config del contenedor, no de un literal', () => {
    expect(uploadValidationMessage('TOO_LARGE', 'FOTOS_EMPLEADO')).toBe(
      'El archivo no puede superar 5 MB.'
    )
    expect(uploadValidationMessage('TOO_LARGE', 'DOCUMENTOS_EMPLEADO')).toBe(
      'El archivo no puede superar 10 MB.'
    )
  })

  // El punto del helper: si el bucket cambia de límite, el texto acompaña solo.
  it('el mensaje de tamaño sigue a CONTAINERS si el límite cambia', () => {
    const esperado = Math.round(CONTAINERS.DOCUMENTOS_EMPLEADO.maxBytes / (1024 * 1024))
    expect(uploadValidationMessage('TOO_LARGE', 'DOCUMENTOS_EMPLEADO')).toContain(`${esperado} MB`)
  })

  it('lista las extensiones permitidas del contenedor, sin repetir', () => {
    expect(uploadValidationMessage('INVALID_TYPE', 'FOTOS_EMPLEADO')).toBe(
      'Solo se permiten archivos JPG, PNG o WEBP.'
    )
    expect(uploadValidationMessage('INVALID_TYPE', 'DOCUMENTOS_EMPLEADO')).toBe(
      'Solo se permiten archivos PDF, JPG o PNG.'
    )
  })

  it('para el resto de códigos delega en el mensaje genérico', () => {
    expect(uploadValidationMessage('UNKNOWN', 'FOTOS_EMPLEADO')).toBe(
      storageErrorMessage('UNKNOWN')
    )
  })
})
