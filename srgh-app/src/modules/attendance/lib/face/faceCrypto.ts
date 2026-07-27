/**
 * Cifrado del embedding facial en transito (cliente → Server Action) con
 * Web Crypto (AES-256-GCM). Funciona identico en navegador y en Node ≥ 18
 * porque ambos exponen globalThis.crypto.subtle.
 *
 * Que protege y que no: la foto nunca sale del dispositivo (eso lo garantiza
 * el pipeline del cliente, no este archivo); esta capa evita que el VECTOR
 * viaje o quede logueado en claro (proxies, logs de request, telemetria).
 * La llave es simetrica y compartida entre cliente y servidor via variables
 * de entorno — no es secreta frente al usuario del kiosco, y no pretende
 * serlo: el secreto de verdad son los vectores enrolados, que solo viven en
 * la base de datos detras de RLS.
 */

export interface EncryptedVector {
  /** IV de 12 bytes, base64. Unico por cifrado (requisito de GCM). */
  iv: string
  /** Ciphertext + tag GCM, base64. */
  data: string
}

const IV_BYTES = 12

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

async function importAesKey(keyBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(keyBase64)
  if (raw.length !== 32) {
    throw new Error('La llave AES debe ser de 32 bytes (256 bits) en base64.')
  }
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** Cifra el vector (serializado como Float32Array) con AES-256-GCM. */
export async function encryptVector(vector: number[], keyBase64: string): Promise<EncryptedVector> {
  const key = await importAesKey(keyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plain = new Float32Array(vector)

  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plain.buffer as ArrayBuffer
  )

  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) }
}

/**
 * Descifra y deserializa el vector. Lanza si la llave no calza o el payload
 * fue alterado (GCM autentica ademas de cifrar) — el llamador decide como
 * traducir eso a un error de usuario.
 */
export async function decryptVector(
  payload: EncryptedVector,
  keyBase64: string
): Promise<number[]> {
  const key = await importAesKey(keyBase64)
  const iv = base64ToBytes(payload.iv)
  const data = base64ToBytes(payload.data)

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource
  )

  return Array.from(new Float32Array(plain))
}
