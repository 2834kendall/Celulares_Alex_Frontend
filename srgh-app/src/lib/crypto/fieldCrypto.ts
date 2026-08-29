import 'server-only'
import { getCryptoKeys } from '@/lib/env.server'
import {
  decryptField as decryptFieldCore,
  encryptField as encryptFieldCore,
  hmacField as hmacFieldCore,
} from '@/lib/crypto/fieldCrypto.core'
import type { DecryptedField } from '@/lib/crypto/fieldCrypto.core'

/**
 * Wrapper server-only de fieldCrypto.core: resuelve las llaves desde el entorno
 * para que las Server Actions no tengan que pasarlas en cada llamada.
 *
 * Diferencia clave con faceCrypto.ts, que es isomorfo a propósito: aquella llave
 * es compartida con el kiosco y no pretende ser secreta frente al usuario. Estas
 * DOS no pueden llegar jamás al navegador — de ahí el 'server-only', que
 * convierte un import desde un Client Component en error de build.
 */

export type { DecryptedField }
export { isEncrypted } from '@/lib/crypto/fieldCrypto.core'

// Las tres son `async` a propósito, aunque el cuerpo sea una sola línea:
// getCryptoKeys() lanza si falta una llave, y sin el async ese error saldría de
// forma SÍNCRONA desde una función cuyo tipo promete una Promise. Eso reventaría
// un `Promise.all(filas.map(decryptField))` antes de construir el array — que es
// justo como lee la planilla.

/** Cifra un valor con la llave del entorno. Devuelve 'v1:<iv>:<ciphertext>'. */
export async function encryptField(plain: string): Promise<string> {
  return encryptFieldCore(plain, getCryptoKeys().FIELD_ENCRYPTION_KEY)
}

/** Descifra distinguiendo vacío, legacy en claro y fallo. Nunca lanza. */
export async function decryptField(stored: string | null): Promise<DecryptedField> {
  return decryptFieldCore(stored, getCryptoKeys().FIELD_ENCRYPTION_KEY)
}

/** Índice ciego del valor. El llamador lo pasa ya normalizado. */
export async function hmacField(plain: string): Promise<string> {
  return hmacFieldCore(plain, getCryptoKeys().FIELD_INDEX_KEY)
}
