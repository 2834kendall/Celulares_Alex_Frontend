import { CONTAINERS } from '@/lib/storage/containers'
import type { StorageContainer, StorageErrorCode } from '@/lib/storage/types'

// ─── Validación de subidas: los bytes mandan, el cliente no ──────────────────
// El `file.type` que declara el navegador es un string que cualquier cliente
// puede falsear. Aquí el tipo REAL se determina leyendo los magic bytes del
// archivo, y ese resultado (no la declaración) decide si entra y con qué
// Content-Type se guarda. Si un atacante lograra almacenar HTML con
// Content-Type: text/html, el navegador lo ejecutaría en el origen del
// storage — por eso el sniff gana siempre.
//
// REGLA (decisión consciente, ver plan SGRH-60): en fase 1 las imágenes NO se
// decodifican server-side — se validan por header, se suben tal cual y las
// decodifica solo el navegador del cliente. Un JPEG/PNG puede declarar
// dimensiones absurdas (100000×100000) y tumbar por memoria a cualquier
// proceso que lo abra (decompression bomb). Si la fase 2 agrega
// resize/thumbnail para avatares, ese código DEBE leer las dimensiones del
// header (SOF en JPEG, IHDR en PNG, VP8X en WebP) y rechazar por megapíxeles
// ANTES de decodificar.
//
// SVG queda prohibido en TODOS los contenedores, incluso los de imagen: un
// SVG es un documento ejecutable (sirve <script>) — XSS almacenado en cuanto
// alguien lo abre desde una URL nuestra. Al ser lista blanca, basta con no
// incluirlo jamás en allowedMimeTypes.

const JPEG_MAGIC = [0xff, 0xd8, 0xff]
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] // 'RIFF'
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50] // 'WEBP' (bytes 8-11 de un RIFF)
// Un polyglot con header %PDF- pasa este sniff — la defensa real es que los
// documentos NUNCA se sirven inline (descarga forzada via downloadAs) y que
// el Content-Type guardado sale de aqui, no del cliente. El escaneo de
// contenido (antivirus/CDR) es un riesgo aceptado documentado en el plan
// SGRH-60: re-evaluar antes de aceptar archivos de externos (CVs).
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // '%PDF-'

function startsWith(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) {
    return false
  }
  return magic.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * Determina el MIME real por magic bytes. Devuelve null si los bytes no
 * corresponden a ningún tipo que el sistema conozca — ante ambigüedad se
 * rechaza (lista blanca, nunca lista negra).
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, JPEG_MAGIC)) {
    return 'image/jpeg'
  }
  if (startsWith(bytes, PNG_MAGIC)) {
    return 'image/png'
  }
  if (startsWith(bytes, RIFF_MAGIC) && startsWith(bytes, WEBP_TAG, 8)) {
    return 'image/webp'
  }
  if (startsWith(bytes, PDF_MAGIC)) {
    return 'application/pdf'
  }
  return null
}

export type ValidateUploadResult =
  { ok: true; mimeType: string; extension: string } | { ok: false; error: StorageErrorCode }

/**
 * Valida bytes contra las reglas del contenedor: tamaño máximo y lista blanca
 * de MIME (determinado por sniff, jamás por la declaración del cliente).
 * El mimeType/extension que devuelve son los que deben usarse al subir.
 */
export function validateUpload(
  bytes: Uint8Array,
  container: StorageContainer
): ValidateUploadResult {
  const config = CONTAINERS[container]

  if (bytes.length === 0) {
    return { ok: false, error: 'INVALID_TYPE' }
  }
  if (bytes.length > config.maxBytes) {
    return { ok: false, error: 'TOO_LARGE' }
  }

  const mimeType = sniffMimeType(bytes)
  if (!mimeType) {
    return { ok: false, error: 'INVALID_TYPE' }
  }

  const extension = config.allowedMimeTypes[mimeType]
  if (!extension) {
    return { ok: false, error: 'INVALID_TYPE' }
  }

  return { ok: true, mimeType, extension }
}
