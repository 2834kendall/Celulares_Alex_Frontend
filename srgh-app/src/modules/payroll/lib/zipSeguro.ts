// Revisión de un .xlsx (que es un zip) ANTES de abrirlo con exceljs.
//
// Un zip pequeño puede inflarse a gigas ("zip bomb"): subir 2 MB bastaba para
// que exceljs agotara la memoria del servidor al abrirlo. Acá se lee el
// directorio del zip y se infla cada entrada con un tope de salida, así que el
// peor caso gasta una cantidad fija de memoria sin importar lo que el archivo
// diga de sí mismo. Un xlsx de verdad (la planilla, unas 10 entradas de XML)
// pasa sobrado.

import { inflateRawSync } from 'node:zlib'

/** Lo que pesa una planilla real descomprimida es del orden de 1 a 5 MB. */
export const MAX_ENTRADAS = 100
export const MAX_BYTES_POR_ENTRADA = 10 * 1024 * 1024
export const MAX_BYTES_TOTALES = 20 * 1024 * 1024

export type RevisionZip = { ok: true } | { ok: false; motivo: string }

const SIGNATURE_EOCD = 0x06054b50
const SIGNATURE_CENTRAL = 0x02014b50
const SIGNATURE_LOCAL = 0x04034b50
const MAX_COMMENT = 0xffff

const INVALIDO: RevisionZip = { ok: false, motivo: 'no es un archivo .xlsx válido' }

function demasiado(que: string): RevisionZip {
  return { ok: false, motivo: `el archivo se descomprime a ${que}` }
}

/** Posición del "end of central directory", buscándolo desde el final. */
function buscarEocd(vista: DataView): number {
  const desde = Math.max(0, vista.byteLength - 22 - MAX_COMMENT)
  for (let i = vista.byteLength - 22; i >= desde; i -= 1) {
    if (vista.getUint32(i, true) === SIGNATURE_EOCD) return i
  }
  return -1
}

export function revisarZipXlsx(archivo: ArrayBuffer | Uint8Array): RevisionZip {
  const bytes = ArrayBuffer.isView(archivo)
    ? new Uint8Array(archivo.buffer, archivo.byteOffset, archivo.byteLength)
    : new Uint8Array(archivo)
  if (bytes.byteLength < 22) return INVALIDO

  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = buscarEocd(vista)
  if (eocd === -1) return INVALIDO

  const entradas = vista.getUint16(eocd + 10, true)
  const tamanoDirectorio = vista.getUint32(eocd + 12, true)
  const inicioDirectorio = vista.getUint32(eocd + 16, true)

  // 0xFFFF / 0xFFFFFFFF marcan un zip64: una planilla no lo necesita.
  if (entradas === 0xffff || inicioDirectorio === 0xffffffff || tamanoDirectorio === 0xffffffff) {
    return INVALIDO
  }
  if (entradas === 0 || entradas > MAX_ENTRADAS) return demasiado('demasiadas partes')
  if (inicioDirectorio + tamanoDirectorio > bytes.byteLength) return INVALIDO

  let total = 0
  let cursor = inicioDirectorio

  for (let i = 0; i < entradas; i += 1) {
    if (cursor + 46 > bytes.byteLength || vista.getUint32(cursor, true) !== SIGNATURE_CENTRAL) {
      return INVALIDO
    }

    const metodo = vista.getUint16(cursor + 10, true)
    const comprimido = vista.getUint32(cursor + 20, true)
    const declarado = vista.getUint32(cursor + 24, true)
    const largoNombre = vista.getUint16(cursor + 28, true)
    const largoExtra = vista.getUint16(cursor + 30, true)
    const largoComentario = vista.getUint16(cursor + 32, true)
    const inicioLocal = vista.getUint32(cursor + 42, true)
    cursor += 46 + largoNombre + largoExtra + largoComentario

    if (declarado > MAX_BYTES_POR_ENTRADA) return demasiado('una parte demasiado grande')

    if (inicioLocal + 30 > bytes.byteLength) return INVALIDO
    if (vista.getUint32(inicioLocal, true) !== SIGNATURE_LOCAL) return INVALIDO
    const inicioDatos =
      inicioLocal +
      30 +
      vista.getUint16(inicioLocal + 26, true) +
      vista.getUint16(inicioLocal + 28, true)
    if (inicioDatos + comprimido > bytes.byteLength) return INVALIDO

    const datos = bytes.subarray(inicioDatos, inicioDatos + comprimido)
    let real: number

    if (metodo === 0) {
      real = datos.byteLength
    } else if (metodo === 8) {
      // El tope corta la inflada aunque el directorio mienta sobre el tamaño.
      try {
        real = inflateRawSync(datos, {
          maxOutputLength: Math.max(1, Math.min(MAX_BYTES_POR_ENTRADA, MAX_BYTES_TOTALES - total)),
        }).byteLength
      } catch (error) {
        const excedido = (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
        return excedido ? demasiado('más de lo permitido') : INVALIDO
      }
    } else {
      return INVALIDO
    }

    total += real
    if (total > MAX_BYTES_TOTALES) return demasiado('más de lo permitido')
  }

  return { ok: true }
}
