import { deflateRawSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { MAX_BYTES_TOTALES, MAX_ENTRADAS, revisarZipXlsx } from './zipSeguro'

interface Entrada {
  nombre: string
  contenido: Buffer
  /** Para simular un directorio que miente sobre el tamaño descomprimido. */
  declarado?: number
}

/** Zip mínimo (deflate), suficiente para armar los casos de prueba. */
function zip(entradas: Entrada[]): ArrayBuffer {
  const locales: Buffer[] = []
  const centrales: Buffer[] = []
  let offset = 0

  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre)
    const comprimido = deflateRawSync(e.contenido)
    const declarado = e.declarado ?? e.contenido.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(declarado, 22)
    local.writeUInt16LE(nombre.length, 26)
    locales.push(local, nombre, comprimido)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(declarado, 24)
    central.writeUInt16LE(nombre.length, 28)
    central.writeUInt32LE(offset, 42)
    centrales.push(central, nombre)

    offset += 30 + nombre.length + comprimido.length
  }

  const directorio = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(entradas.length, 8)
  fin.writeUInt16LE(entradas.length, 10)
  fin.writeUInt32LE(directorio.length, 12)
  fin.writeUInt32LE(offset, 16)

  const todo = Buffer.concat([...locales, directorio, fin])
  return todo.buffer.slice(todo.byteOffset, todo.byteOffset + todo.byteLength) as ArrayBuffer
}

describe('revisarZipXlsx', () => {
  it('deja pasar un Excel real generado con exceljs', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Planilla').getCell('A1').value = 'Cédula'
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    expect(revisarZipXlsx(buffer)).toEqual({ ok: true })
  })

  it('rechaza un zip que se infla por encima del límite (zip bomb)', () => {
    // 30 MB de ceros pesan unos 30 KB comprimidos.
    const bomba = zip([
      { nombre: 'xl/worksheets/sheet1.xml', contenido: Buffer.alloc(30 * 1024 * 1024) },
    ])

    expect(bomba.byteLength).toBeLessThan(2 * 1024 * 1024)
    expect(revisarZipXlsx(bomba)).toMatchObject({ ok: false })
  })

  it('no le cree al directorio cuando dice que la parte es chica', () => {
    const mentiroso = zip([
      { nombre: 'a.xml', contenido: Buffer.alloc(MAX_BYTES_TOTALES + 1024), declarado: 10 },
    ])

    expect(revisarZipXlsx(mentiroso)).toMatchObject({ ok: false })
  })

  it('suma todas las partes: muchas medianas también se rechazan', () => {
    const parte = Buffer.alloc(6 * 1024 * 1024)
    const varias = zip(['a', 'b', 'c', 'd'].map((n) => ({ nombre: `${n}.xml`, contenido: parte })))

    expect(revisarZipXlsx(varias)).toMatchObject({ ok: false })
  })

  it('rechaza demasiadas partes', () => {
    const muchas = zip(
      Array.from({ length: MAX_ENTRADAS + 1 }, (_, i) => ({
        nombre: `p${i}.xml`,
        contenido: Buffer.from('x'),
      }))
    )

    expect(revisarZipXlsx(muchas)).toMatchObject({ ok: false })
  })

  it('rechaza algo que no es un zip', () => {
    const texto = new TextEncoder().encode('esto no es un excel, es texto plano de prueba')
    expect(revisarZipXlsx(texto.buffer as ArrayBuffer)).toEqual({
      ok: false,
      motivo: 'no es un archivo .xlsx válido',
    })
  })
})
