import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// fieldCrypto.ts y env.server.ts importan 'server-only', que revienta fuera de
// Next.js (ver planillaExcel.test.ts).
vi.mock('server-only', () => ({}))

/**
 * Wrapper server-only: lo único suyo es resolver las llaves del entorno. La
 * criptografía se prueba en fieldCrypto.core.test.ts.
 *
 * Cada test reimporta el módulo (resetModules) porque getCryptoKeys cachea en
 * una variable de módulo: sin eso, el primer test fijaría las llaves para todos
 * y la rama de "falta la variable" sería inalcanzable.
 */

function llave(relleno: number): string {
  return Buffer.from(new Uint8Array(32).fill(relleno)).toString('base64')
}

async function importarConEnv(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [clave, valor] of Object.entries(env)) {
    if (valor === undefined) vi.stubEnv(clave, '')
    else vi.stubEnv(clave, valor)
  }
  return import('@/lib/crypto/fieldCrypto')
}

const ENV_OK = { FIELD_ENCRYPTION_KEY: llave(3), FIELD_INDEX_KEY: llave(4) }

describe('fieldCrypto (wrapper)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('cifra y descifra tomando la llave del entorno', async () => {
    const { encryptField, decryptField } = await importarConEnv(ENV_OK)

    const cifrado = await encryptField('CR05015202001026284066')

    expect(cifrado.startsWith('v1:')).toBe(true)
    await expect(decryptField(cifrado)).resolves.toEqual({
      ok: true,
      value: 'CR05015202001026284066',
    })
  })

  it('calcula el índice ciego con la llave de índice, no con la de cifrado', async () => {
    const mod = await importarConEnv(ENV_OK)
    const conIndice4 = await mod.hmacField('CR05015202001026284066')

    const otro = await importarConEnv({ ...ENV_OK, FIELD_INDEX_KEY: llave(9) })
    const conIndice9 = await otro.hmacField('CR05015202001026284066')

    expect(conIndice4).not.toEqual(conIndice9)
  })

  it('falla claro si falta FIELD_ENCRYPTION_KEY', async () => {
    const { encryptField } = await importarConEnv({
      FIELD_ENCRYPTION_KEY: undefined,
      FIELD_INDEX_KEY: llave(4),
    })

    await expect(encryptField('x')).rejects.toThrow('Missing or invalid field encryption keys')
  })

  it('falla claro si falta FIELD_INDEX_KEY', async () => {
    const { hmacField } = await importarConEnv({
      FIELD_ENCRYPTION_KEY: llave(3),
      FIELD_INDEX_KEY: undefined,
    })

    await expect(hmacField('x')).rejects.toThrow('Missing or invalid field encryption keys')
  })
})
