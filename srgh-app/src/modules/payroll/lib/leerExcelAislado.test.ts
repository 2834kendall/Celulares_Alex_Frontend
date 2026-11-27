import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { HojaLeida, leerExcelAislado, MAX_FILAS } from './leerExcelAislado'

vi.mock('server-only', () => ({}))

const FORMULA = /^[=+\-@\t\r]/

async function libro(filas: number, columnas: number, texto = 'dato'): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Planilla')
  for (let f = 1; f <= filas; f += 1) {
    ws.getRow(f).values = Array.from({ length: columnas }, (_, c) => `${texto} ${f}-${c}`)
  }
  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer).buffer
}

describe('leerExcelAislado', () => {
  it('lee las celdas resueltas y quita el apóstrofo de seguridad', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Planilla')
    ws.getCell('A1').value = "'=HYPERLINK(1)"
    ws.getCell('B1').value = 12.5
    ws.getCell('C1').value = { formula: 'B1*2', result: 25 }
    ws.getCell('A2').value = { richText: [{ text: 'Ho' }, { text: 'la' }] }
    const buffer = new Uint8Array(await wb.xlsx.writeBuffer()).buffer

    const r = await leerExcelAislado(buffer, FORMULA)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    const hoja = new HojaLeida(r.hojas[0])
    expect(hoja.nombre).toBe('Planilla')
    expect(hoja.celda(1, 1)).toBe('=HYPERLINK(1)')
    expect(hoja.celda(1, 2)).toBe(12.5)
    expect(hoja.celda(1, 3)).toBe(25)
    expect(hoja.celda(2, 1)).toBe('Hola')
    // Fuera de la hoja: vacía, no undefined ni error.
    expect(hoja.celda(50, 50)).toBeNull()
  })

  it('un archivo que no es Excel no tumba nada: devuelve inválido', async () => {
    const r = await leerExcelAislado(new Uint8Array([1, 2, 3, 4]).buffer, FORMULA)
    expect(r).toEqual({ ok: false, motivo: 'invalido' })
  })

  it('corta la lectura si pasa del tiempo', async () => {
    const r = await leerExcelAislado(await libro(10, 5), FORMULA, { tiempoMs: 1 })
    expect(r).toEqual({ ok: false, motivo: 'tiempo' })
  })

  it('si el proceso se queda sin memoria, se mata solo ese proceso y avisa', async () => {
    const r = await leerExcelAislado(await libro(4000, 40), FORMULA, { memoriaMb: 32 })
    expect(r).toEqual({ ok: false, motivo: 'memoria' })
  })

  // Con un hilo (worker_threads) el tope se ignoraba si el servidor arranca con
  // --max-old-space-size en NODE_OPTIONS. El proceso no lo hereda.
  it('el tope de memoria se respeta aunque el servidor tenga otro en NODE_OPTIONS', async () => {
    const antes = process.env.NODE_OPTIONS
    process.env.NODE_OPTIONS = '--max-old-space-size=4096'
    try {
      const r = await leerExcelAislado(await libro(4000, 40), FORMULA, { memoriaMb: 32 })
      expect(r).toEqual({ ok: false, motivo: 'memoria' })
    } finally {
      if (antes === undefined) delete process.env.NODE_OPTIONS
      else process.env.NODE_OPTIONS = antes
    }
  })

  it('rechaza una hoja con más filas de las que tiene cualquier planilla', async () => {
    const r = await leerExcelAislado(await libro(MAX_FILAS + 1, 1), FORMULA)
    expect(r).toEqual({ ok: false, motivo: 'muy_grande' })
  })

  it('no toca el archivo de quien llama', async () => {
    const buffer = await libro(2, 2)
    const largo = buffer.byteLength
    await leerExcelAislado(buffer, FORMULA)
    expect(buffer.byteLength).toBe(largo)
  })
})
