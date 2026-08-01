import { describe, expect, it } from 'vitest'
import { sniffMimeType, validateUpload } from './validation'
import { CONTAINERS } from './containers'

// Bytes reales de cada formato (header + relleno para simular contenido).
function jpegBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

function pngBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return bytes
}

function webpBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x52, 0x49, 0x46, 0x46]) // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  return bytes
}

function pdfBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]) // '%PDF-1.7'
  return bytes
}

describe('sniffMimeType', () => {
  it('detecta JPEG por magic bytes', () => {
    expect(sniffMimeType(jpegBytes())).toBe('image/jpeg')
  })

  it('detecta PNG por magic bytes', () => {
    expect(sniffMimeType(pngBytes())).toBe('image/png')
  })

  it('detecta WebP (RIFF + tag WEBP en offset 8)', () => {
    expect(sniffMimeType(webpBytes())).toBe('image/webp')
  })

  it('detecta PDF por %PDF-', () => {
    expect(sniffMimeType(pdfBytes())).toBe('application/pdf')
  })

  it('HTML renombrado a .pdf no matchea (los bytes mandan)', () => {
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>')
    expect(sniffMimeType(html)).toBeNull()
  })

  it('un RIFF que no es WebP (ej. WAV) no pasa como imagen', () => {
    const wav = new Uint8Array(64)
    wav.set([0x52, 0x49, 0x46, 0x46])
    wav.set([0x57, 0x41, 0x56, 0x45], 8) // 'WAVE'
    expect(sniffMimeType(wav)).toBeNull()
  })

  it('bytes desconocidos devuelven null (lista blanca)', () => {
    expect(sniffMimeType(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]))).toBeNull()
  })

  it('un archivo más corto que el magic no matchea', () => {
    expect(sniffMimeType(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(sniffMimeType(new Uint8Array(0))).toBeNull()
  })
})

describe('validateUpload', () => {
  it('acepta un JPEG dentro del límite y devuelve MIME + extensión canónica', () => {
    const result = validateUpload(jpegBytes(), 'FOTOS_EMPLEADO')
    expect(result).toEqual({ ok: true, mimeType: 'image/jpeg', extension: 'jpg' })
  })

  it('acepta PNG y WebP en FOTOS_EMPLEADO', () => {
    expect(validateUpload(pngBytes(), 'FOTOS_EMPLEADO')).toEqual({
      ok: true,
      mimeType: 'image/png',
      extension: 'png',
    })
    expect(validateUpload(webpBytes(), 'FOTOS_EMPLEADO')).toEqual({
      ok: true,
      mimeType: 'image/webp',
      extension: 'webp',
    })
  })

  it('rechaza archivo vacío', () => {
    expect(validateUpload(new Uint8Array(0), 'FOTOS_EMPLEADO')).toEqual({
      ok: false,
      error: 'INVALID_TYPE',
    })
  })

  it('rechaza por tamaño ANTES de mirar el tipo', () => {
    const oversize = jpegBytes(CONTAINERS.FOTOS_EMPLEADO.maxBytes + 1)
    expect(validateUpload(oversize, 'FOTOS_EMPLEADO')).toEqual({ ok: false, error: 'TOO_LARGE' })
  })

  it('acepta exactamente maxBytes (límite inclusivo)', () => {
    const exact = jpegBytes(CONTAINERS.FOTOS_EMPLEADO.maxBytes)
    expect(validateUpload(exact, 'FOTOS_EMPLEADO')).toMatchObject({ ok: true })
  })

  it('rechaza bytes que no matchean ningún tipo conocido (txt renombrado a .jpg)', () => {
    const texto = new TextEncoder().encode('hola, soy un txt disfrazado de jpg')
    expect(validateUpload(texto, 'FOTOS_EMPLEADO')).toEqual({ ok: false, error: 'INVALID_TYPE' })
  })

  it('rechaza un tipo real pero no permitido en el contenedor (webp en DOCUMENTOS)', () => {
    // DOCUMENTOS_EMPLEADO admite pdf/jpg/png pero no webp.
    expect(validateUpload(webpBytes(), 'DOCUMENTOS_EMPLEADO')).toEqual({
      ok: false,
      error: 'INVALID_TYPE',
    })
  })

  it('acepta PDF en DOCUMENTOS_EMPLEADO con extensión canónica pdf', () => {
    expect(validateUpload(pdfBytes(), 'DOCUMENTOS_EMPLEADO')).toEqual({
      ok: true,
      mimeType: 'application/pdf',
      extension: 'pdf',
    })
  })

  it('rechaza PDF en FOTOS_EMPLEADO (tipo real, contenedor equivocado)', () => {
    // Un PDF renombrado a .jpg con file.type image/jpeg cae aquí: el sniff
    // da application/pdf y FOTOS_EMPLEADO no lo permite.
    expect(validateUpload(pdfBytes(), 'FOTOS_EMPLEADO')).toEqual({
      ok: false,
      error: 'INVALID_TYPE',
    })
  })

  it('acepta jpg/png en DOCUMENTOS_EMPLEADO (incapacidad fotografiada)', () => {
    expect(validateUpload(jpegBytes(), 'DOCUMENTOS_EMPLEADO')).toMatchObject({ ok: true })
    expect(validateUpload(pngBytes(), 'DOCUMENTOS_EMPLEADO')).toMatchObject({ ok: true })
  })

  it('rechaza un PDF que excede los 10 MB del contenedor de documentos', () => {
    const oversize = pdfBytes(CONTAINERS.DOCUMENTOS_EMPLEADO.maxBytes + 1)
    expect(validateUpload(oversize, 'DOCUMENTOS_EMPLEADO')).toEqual({
      ok: false,
      error: 'TOO_LARGE',
    })
  })

  it('rechaza SVG en TODOS los contenedores (documento ejecutable, no imagen)', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    expect(validateUpload(svg, 'FOTOS_EMPLEADO')).toEqual({ ok: false, error: 'INVALID_TYPE' })
    expect(validateUpload(svg, 'DOCUMENTOS_EMPLEADO')).toEqual({
      ok: false,
      error: 'INVALID_TYPE',
    })
  })
})
