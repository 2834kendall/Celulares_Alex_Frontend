/**
 * Cifrado de campos sensibles AT-REST (AES-256-GCM) + índice ciego (HMAC-SHA256).
 *
 * Qué protege y qué no: esto NO decide quién puede ver un dato — eso lo sigue
 * decidiendo la RLS. Lo que agrega es que tener acceso a la base ya no alcanza
 * para leerlo: un pg_dump, un backup, el Table Editor del dashboard, una fuga de
 * la secret key (que bypasea RLS) o un bug en una policy entregan ciphertext.
 *
 * ── Por qué este archivo NO importa 'server-only' ────────────────────────────
 * Es la mitad pura: recibe las llaves POR PARÁMETRO y no toca env, Next ni
 * Supabase. Eso permite que el script de backfill (scripts/encrypt-payment-data.ts)
 * lo importe tal cual bajo `node --experimental-strip-types`, sin transpilar y
 * sin duplicar la criptografía. El wrapper que carga las llaves del entorno —y
 * que sí es server-only— vive en ./fieldCrypto.ts, y es el que usan las actions.
 *
 * Consecuencia: acá no entra sintaxis que obligue a emitir código (nada de enum,
 * namespace ni parameter properties), y todo tipo que cruce a un consumidor se
 * importa con `import type`. Node no infiere qué binding es un tipo: con un
 * import normal el stripper lo deja, el export nombrado no existe en runtime y
 * el script revienta al arrancar.
 */

/** IV de 12 bytes, único por cifrado (requisito de GCM). */
const IV_BYTES = 12

/** Versión del formato de almacenamiento: 'v1:<iv b64>:<ciphertext+tag b64>'. */
const VERSION = 'v1'

/**
 * Detecta cualquier versión, no solo la actual: una fila 'v2:...' escrita por
 * una rotación futura tiene que reconocerse como cifrada (y fallar al leer con
 * la llave vieja), nunca confundirse con texto plano.
 */
const VERSION_PREFIX = /^v[0-9]+:/

const KEY_BYTES = 32

/**
 * Tres estados, no dos. Colapsar "no hay dato" con "hay un dato que no puedo
 * descifrar" en un solo `null` es lo que convierte un formulario en blanco en un
 * borrado irreversible: la UI se pinta vacía, el usuario guarda cualquier otro
 * campo y el upsert escribe null encima del ciphertext. La unión discriminada
 * obliga a cada punto de lectura a decidir qué hace con el tercer caso.
 */
export type DecryptedField = { ok: true; value: string | null } | { ok: false }

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

/**
 * Las llaves importadas se memoizan por su base64.
 *
 * faceCrypto.ts importa la llave en cada llamada y ahí da lo mismo: procesa un
 * vector por request. Acá el patrón de acceso es de lote — un período de
 * planilla descifra una cuenta por empleado, y el backfill una por fila — así
 * que sin cache serían cientos de importKey por render. Es seguro memoizar
 * porque importar una llave es función pura de su material.
 */
const aesKeys = new Map<string, Promise<CryptoKey>>()
const hmacKeys = new Map<string, Promise<CryptoKey>>()

function cachedKey(
  cache: Map<string, Promise<CryptoKey>>,
  keyBase64: string,
  build: (keyBase64: string) => Promise<CryptoKey>
): Promise<CryptoKey> {
  const hit = cache.get(keyBase64)
  if (hit) return hit

  const pending = build(keyBase64)
  // Una llave inválida no se cachea: además de permitir reintentar, el .catch
  // deja la promesa manejada y evita un unhandledRejection colgado en el Map.
  pending.catch(() => cache.delete(keyBase64))
  cache.set(keyBase64, pending)
  return pending
}

function rawKey(keyBase64: string, nombre: string): Uint8Array {
  const raw = base64ToBytes(keyBase64)
  if (raw.length !== KEY_BYTES) {
    throw new Error(`${nombre} debe ser de ${KEY_BYTES} bytes (256 bits) en base64.`)
  }
  return raw
}

function importAesKey(keyBase64: string): Promise<CryptoKey> {
  return cachedKey(aesKeys, keyBase64, async (k) =>
    crypto.subtle.importKey(
      'raw',
      rawKey(k, 'La llave de cifrado') as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    )
  )
}

function importHmacKey(keyBase64: string): Promise<CryptoKey> {
  return cachedKey(hmacKeys, keyBase64, async (k) =>
    crypto.subtle.importKey(
      'raw',
      rawKey(k, 'La llave de índice') as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
  )
}

/** ¿El valor almacenado ya está cifrado, o es una fila legacy en texto plano? */
export function isEncrypted(value: string): boolean {
  return VERSION_PREFIX.test(value)
}

/** Cifra un valor y lo serializa como 'v1:<iv>:<ciphertext+tag>', todo base64. */
export async function encryptField(plain: string, keyBase64: string): Promise<string> {
  const key = await importAesKey(keyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain) as BufferSource
  )

  return `${VERSION}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`
}

/**
 * Descifra tolerando los dos casos que no son un error real: columna vacía y
 * fila legacy en texto plano (anterior al backfill).
 *
 * NUNCA lanza, igual que verifyFaceTicket: la planilla descifra en lote y una
 * fila corrupta no puede tumbar la página. Pero tampoco silencia el problema:
 * devuelve { ok: false }, que el llamador está obligado a distinguir de "vacío".
 */
export async function decryptField(
  stored: string | null,
  keyBase64: string
): Promise<DecryptedField> {
  if (stored === null || stored === '') return { ok: true, value: null }
  if (!isEncrypted(stored)) return { ok: true, value: stored }

  const [version, iv, data] = stored.split(':')

  if (version !== VERSION || !iv || !data) {
    console.error(`[fieldCrypto] Formato desconocido al descifrar (versión '${version}').`)
    return { ok: false }
  }

  try {
    const key = await importAesKey(keyBase64)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(iv) as BufferSource },
      key,
      base64ToBytes(data) as BufferSource
    )
    return { ok: true, value: new TextDecoder().decode(plain) }
  } catch {
    // GCM autentica además de cifrar: acá caen tanto la llave equivocada como
    // el payload alterado, y no hay forma de distinguirlos (ni conviene).
    console.error('[fieldCrypto] No se pudo descifrar el valor almacenado.')
    return { ok: false }
  }
}

/**
 * Índice ciego: HMAC-SHA256 en base64, para poder comparar dos valores sin
 * poder leerlos. Existe porque el IV aleatorio de GCM hace que dos cifrados del
 * mismo número no se parezcan en nada, y sin esto no habría manera de preguntar
 * "¿esta cuenta ya está registrada para otro empleado?".
 *
 * Va con una llave DISTINTA a la de cifrado a propósito: rotar una no obliga a
 * rotar la otra, y comprometer una no entrega la otra.
 *
 * El llamador es responsable de pasar el valor ya NORMALIZADO. Sobre texto
 * crudo, 'CR05 0152…' y 'cr050152…' darían HMACs distintos y la comparación no
 * serviría para nada.
 */
export async function hmacField(plain: string, indexKeyBase64: string): Promise<string> {
  const key = await importHmacKey(indexKeyBase64)
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(plain) as BufferSource)
  return bytesToBase64(new Uint8Array(mac))
}
