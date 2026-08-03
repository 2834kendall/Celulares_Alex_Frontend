import { describe, expect, it } from 'vitest'
import { decryptVector, encryptVector } from './faceCrypto'

// 32 bytes fijos en base64 (solo para tests).
const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)))
const OTHER_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 255 - i)))

describe('faceCrypto (AES-256-GCM, Web Crypto)', () => {
  it('cifra y descifra un vector ida y vuelta', async () => {
    const vector = [0.12, -0.5, 0.999, 0]

    const payload = await encryptVector(vector, KEY)
    const decrypted = await decryptVector(payload, KEY)

    expect(decrypted).toHaveLength(4)
    // Float32 pierde precision de double: comparar con tolerancia.
    decrypted.forEach((x, i) => expect(x).toBeCloseTo(vector[i], 5))
  })

  it('el ciphertext no es el vector en claro codificado', async () => {
    const vector = [1, 2, 3]
    const plainBase64 = btoa(
      String.fromCharCode(...new Uint8Array(new Float32Array(vector).buffer))
    )

    const payload = await encryptVector(vector, KEY)

    expect(payload.data).not.toBe(plainBase64)
    // Ciphertext = plaintext (12 bytes) + tag GCM (16 bytes) = 28 bytes.
    expect(atob(payload.data)).toHaveLength(vector.length * 4 + 16)
    expect(payload.iv).toBeTruthy()
  })

  it('genera IV distinto en cada cifrado (requisito GCM)', async () => {
    const a = await encryptVector([1, 2], KEY)
    const b = await encryptVector([1, 2], KEY)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })

  it('falla al descifrar con otra llave', async () => {
    const payload = await encryptVector([1, 2, 3], KEY)
    await expect(decryptVector(payload, OTHER_KEY)).rejects.toThrow()
  })

  it('falla si el payload fue alterado (GCM autentica)', async () => {
    const payload = await encryptVector([1, 2, 3], KEY)
    const bytes = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0))
    bytes[0] ^= 0xff
    const tampered = { ...payload, data: btoa(String.fromCharCode(...bytes)) }
    await expect(decryptVector(tampered, KEY)).rejects.toThrow()
  })

  it('rechaza llaves que no son de 32 bytes', async () => {
    await expect(encryptVector([1], btoa('corta'))).rejects.toThrow(/32 bytes/)
  })
})
