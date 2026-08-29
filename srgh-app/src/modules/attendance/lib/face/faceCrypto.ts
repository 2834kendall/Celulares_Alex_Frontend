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

/**
 * Payload facial completo: el embedding MAS la prueba de vida que lo respalda.
 *
 * Van juntos bajo el mismo sello GCM a proposito — ver livenessProof.ts: si la
 * prueba viajara como un campo aparte se podria acompanar el vector de una
 * foto con la prueba de vida de otra captura. Aca no se pueden separar sin
 * romper la autenticacion.
 *
 * Se serializa como JSON y no como Float32Array porque ahora lleva dos cosas
 * de forma distinta. El costo es tamano (unos 3 KB en base64 contra 700 bytes)
 * y a cambio el vector conserva la precision de doble que entrego el modelo,
 * en vez de pasar por un redondeo a simple.
 */
export interface FacePayload<TLiveness = unknown> {
  vector: number[]
  liveness: TLiveness
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Cifra el vector junto con su prueba de vida. */
export async function encryptFacePayload<TLiveness>(
  payload: FacePayload<TLiveness>,
  keyBase64: string
): Promise<EncryptedVector> {
  const key = await importAesKey(keyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plain = encoder.encode(JSON.stringify(payload))

  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plain as BufferSource
  )

  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) }
}

/**
 * Descifra el payload facial. Lanza si la llave no calza, el payload fue
 * alterado, o el contenido no tiene la forma esperada — el llamador decide
 * como traducir eso a un error de usuario.
 */
export async function decryptFacePayload(
  payload: EncryptedVector,
  keyBase64: string
): Promise<FacePayload> {
  const key = await importAesKey(keyBase64)
  const iv = base64ToBytes(payload.iv)
  const data = base64ToBytes(payload.data)

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource
  )

  const parsed: unknown = JSON.parse(decoder.decode(plain))

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as FacePayload).vector) ||
    !(parsed as FacePayload).vector.every((x) => typeof x === 'number' && Number.isFinite(x))
  ) {
    throw new Error('El payload facial no tiene la forma esperada.')
  }

  return parsed as FacePayload
}
