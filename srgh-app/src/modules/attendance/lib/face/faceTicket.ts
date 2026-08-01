/**
 * Ticket facial: prueba firmada (HMAC-SHA256) de que verifyFace confirmo la
 * identidad de un empleado hace instantes. Sin esto, registerKioskMark
 * tendria que confiar en que el cliente diga "fue facial" — y una marca
 * FACIAL seria falsificable con un fetch a mano. El ticket cierra ese hueco
 * sin tocar la base de datos: solo verifyFace (servidor) conoce el secreto.
 *
 * Formato: "<employeeId>.<expiraEpochMs>.<firmaBase64url>". TTL corto: el
 * ticket se emite al verificar el rostro y se consume en la marca inmediata.
 */

const DEFAULT_TTL_MS = 2 * 60 * 1000

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  )
}

export async function signFaceTicket(
  employeeId: number,
  secret: string,
  nowMs: number = Date.now(),
  ttlMs: number = DEFAULT_TTL_MS
): Promise<string> {
  const exp = nowMs + ttlMs
  const payload = `${employeeId}.${exp}`
  const key = await importHmacKey(secret, 'sign')
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload) as BufferSource)
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`
}

/**
 * true solo si la firma es valida, el ticket no expiro y pertenece a ESTE
 * empleado. Cualquier malformacion devuelve false (nunca lanza): un ticket
 * invalido no es un error del sistema, es una marca que se degrada a MANUAL.
 */
export async function verifyFaceTicket(
  ticket: string,
  employeeId: number,
  secret: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  const parts = ticket.split('.')
  if (parts.length !== 3) return false

  const [empPart, expPart, sigPart] = parts
  if (Number(empPart) !== employeeId) return false

  const exp = Number(expPart)
  if (!Number.isFinite(exp) || exp < nowMs) return false

  let sig: Uint8Array
  try {
    sig = fromBase64Url(sigPart)
  } catch {
    return false
  }

  const key = await importHmacKey(secret, 'verify')
  // crypto.subtle.verify hace la comparacion en tiempo constante.
  return crypto.subtle.verify(
    'HMAC',
    key,
    sig as BufferSource,
    encoder.encode(`${empPart}.${expPart}`) as BufferSource
  )
}
