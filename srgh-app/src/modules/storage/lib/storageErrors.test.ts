import { describe, expect, it } from 'vitest'
import { storageErrorMessage } from './storageErrors'
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
