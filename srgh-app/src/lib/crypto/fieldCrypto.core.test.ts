import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptField, encryptField, hmacField, isEncrypted } from '@/lib/crypto/fieldCrypto.core'

/** Llave de 32 bytes en base64, distinta por `relleno`. */
function llave(relleno: number): string {
  return Buffer.from(new Uint8Array(32).fill(relleno)).toString('base64')
}

const KEY = llave(1)
const OTRA_KEY = llave(2)

const IBAN = 'CR05015202001026284066'
const SINPE = '88887777'

describe('fieldCrypto.core', () => {
  beforeEach(() => {
    // decryptField loguea cada fallo a propósito; en los tests que ejercitan
    // esas ramas el ruido no aporta.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('encryptField / decryptField', () => {
    it('hace round-trip de un IBAN', async () => {
      const cifrado = await encryptField(IBAN, KEY)

      expect(cifrado).not.toContain(IBAN)
      expect(cifrado.startsWith('v1:')).toBe(true)
      await expect(decryptField(cifrado, KEY)).resolves.toEqual({ ok: true, value: IBAN })
    })

    it('hace round-trip de un SINPE', async () => {
      const cifrado = await encryptField(SINPE, KEY)

      expect(cifrado).not.toContain(SINPE)
      await expect(decryptField(cifrado, KEY)).resolves.toEqual({ ok: true, value: SINPE })
    })

    it('produce ciphertext distinto para el mismo valor (IV aleatorio)', async () => {
      const a = await encryptField(SINPE, KEY)
      const b = await encryptField(SINPE, KEY)

      // Sin esto un SINPE de 8 dígitos sería trivial de romper por diccionario:
      // bastaría cifrar los 10⁸ posibles y comparar.
      expect(a).not.toEqual(b)
      await expect(decryptField(a, KEY)).resolves.toEqual({ ok: true, value: SINPE })
      await expect(decryptField(b, KEY)).resolves.toEqual({ ok: true, value: SINPE })
    })

    it('rechaza una llave que no mide 32 bytes', async () => {
      await expect(encryptField(IBAN, 'bWlsbGF2ZQ==')).rejects.toThrow(
        'La llave de cifrado debe ser de 32 bytes'
      )
    })
  })

  // ── Los tres estados ──────────────────────────────────────────────────────
  // Distinguir "no hay dato" de "hay dato y no se pudo leer" no es cosmético:
  // colapsarlos hace que un formulario en blanco borre el ciphertext.

  describe('decryptField: vacío vs. ilegible', () => {
    it('columna null es vacío, no error', async () => {
      await expect(decryptField(null, KEY)).resolves.toEqual({ ok: true, value: null })
    })

    it('cadena vacía es vacío, no error', async () => {
      await expect(decryptField('', KEY)).resolves.toEqual({ ok: true, value: null })
    })

    it('devuelve tal cual una fila legacy en texto plano', async () => {
      // Ventana entre el deploy y el backfill: la fila todavía no está cifrada.
      await expect(decryptField(IBAN, KEY)).resolves.toEqual({ ok: true, value: IBAN })
    })

    it('falla con la llave equivocada', async () => {
      const cifrado = await encryptField(IBAN, KEY)

      await expect(decryptField(cifrado, OTRA_KEY)).resolves.toEqual({ ok: false })
    })

    it('falla si el payload fue alterado (GCM autentica)', async () => {
      const cifrado = await encryptField(IBAN, KEY)
      const [version, iv, data] = cifrado.split(':')
      const alterado = `${version}:${iv}:${data.slice(0, -2)}AA`

      await expect(decryptField(alterado, KEY)).resolves.toEqual({ ok: false })
    })

    it('falla ante una versión de formato desconocida', async () => {
      // Una rotación futura escribiría v2:. Con la llave vieja no se puede leer,
      // pero tampoco debe confundirse con texto plano.
      await expect(decryptField('v2:abc:def', KEY)).resolves.toEqual({ ok: false })
    })

    it('falla ante un valor con prefijo pero incompleto', async () => {
      await expect(decryptField('v1:soloiv', KEY)).resolves.toEqual({ ok: false })
    })
  })

  describe('isEncrypted', () => {
    it('reconoce el formato propio y cualquier versión futura', () => {
      expect(isEncrypted('v1:abc:def')).toBe(true)
      expect(isEncrypted('v2:abc:def')).toBe(true)
    })

    it('no confunde un IBAN ni un SINPE con ciphertext', () => {
      expect(isEncrypted(IBAN)).toBe(false)
      expect(isEncrypted(SINPE)).toBe(false)
      expect(isEncrypted('')).toBe(false)
    })
  })

  describe('hmacField', () => {
    it('es determinístico: el mismo valor da el mismo índice', async () => {
      // Es justo lo contrario del cifrado, y es lo que permite comparar dos
      // cuentas sin poder leerlas.
      await expect(hmacField(IBAN, KEY)).resolves.toEqual(await hmacField(IBAN, KEY))
    })

    it('distingue valores distintos', async () => {
      expect(await hmacField(IBAN, KEY)).not.toEqual(await hmacField(SINPE, KEY))
    })

    it('cambia con la llave de índice', async () => {
      // Por esto rotar la llave de índice obliga a recalcular la columna entera.
      expect(await hmacField(IBAN, KEY)).not.toEqual(await hmacField(IBAN, OTRA_KEY))
    })

    it('rechaza una llave que no mide 32 bytes', async () => {
      await expect(hmacField(IBAN, 'Y29ydGE=')).rejects.toThrow(
        'La llave de índice debe ser de 32 bytes'
      )
    })
  })

  describe('memoización de llaves', () => {
    it('importa cada llave una sola vez', async () => {
      const spy = vi.spyOn(crypto.subtle, 'importKey')
      // Llaves nuevas: las de arriba ya están en el cache del módulo.
      const unaKey = llave(7)
      const otraKey = llave(8)

      await encryptField(IBAN, unaKey)
      await encryptField(IBAN, unaKey)
      await encryptField(IBAN, unaKey)

      // Sin cache, un período de planilla de 200 empleados haría 200 importKey.
      expect(spy).toHaveBeenCalledTimes(1)

      await encryptField(IBAN, otraKey)
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('no deja cacheada una llave inválida', async () => {
      const invalida = 'bm8='

      await expect(encryptField(IBAN, invalida)).rejects.toThrow()
      // El segundo intento vuelve a fallar con el mismo error, no con un
      // "promise rechazada" reutilizada del cache.
      await expect(encryptField(IBAN, invalida)).rejects.toThrow(
        'La llave de cifrado debe ser de 32 bytes'
      )
    })
  })
})
