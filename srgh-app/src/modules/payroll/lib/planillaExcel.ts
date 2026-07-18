// Generación y lectura del Excel de planilla (machote del cliente).
// Solo servidor: exceljs no debe llegar al bundle del navegador.

import 'server-only'
import ExcelJS from 'exceljs'
import {
  CCSS_RATE,
  PLANILLA_HEADERS,
  parsePlanillaRow,
  type PlanillaRowError,
  type PlanillaRowInput,
  type RawCell,
} from './planilla'

const SHEET_NAME = 'Planilla'
const HEADER_ROW = 4
const MONEY_FORMAT = '#,##0.00'

export interface EmpleadoPlantilla {
  cedula: string
  nombre: string
  /** Salario base mensual del contrato; en la plantilla se prellena la mitad (quincena). */
  salarioBaseMensual: number
}

export interface PlantillaInfo {
  titulo: string
  subtitulo: string
}

/**
 * Construye la plantilla: una fila por empleado activo, ingresos editables
 * y fórmulas visibles de bruto/CCSS/neto (mismas del machote). Al subirla,
 * el servidor recalcula todo — las fórmulas son solo ayuda visual.
 */
export async function buildPlanillaTemplate(
  info: PlantillaInfo,
  empleados: EmpleadoPlantilla[]
): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(SHEET_NAME)

  ws.getCell('A1').value = info.titulo
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = info.subtitulo
  ws.getCell('A2').font = { color: { argb: 'FF64748B' }, size: 10 }
  ws.getCell('A3').value =
    'Edita solo los montos (columnas C a G). No cambies la cédula ni agregues columnas.'
  ws.getCell('A3').font = { color: { argb: 'FFB45309' }, size: 10 }

  const headerRow = ws.getRow(HEADER_ROW)
  PLANILLA_HEADERS.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = header
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
    cell.alignment = { vertical: 'middle' }
  })

  empleados.forEach((emp, index) => {
    const rowNumber = HEADER_ROW + 1 + index
    const row = ws.getRow(rowNumber)
    row.getCell(1).value = emp.cedula
    row.getCell(2).value = emp.nombre
    row.getCell(3).value = Math.round((emp.salarioBaseMensual / 2) * 100) / 100
    row.getCell(4).value = 0
    row.getCell(5).value = 0
    row.getCell(6).value = 0
    row.getCell(7).value = 0
    row.getCell(8).value = { formula: `SUM(C${rowNumber}:G${rowNumber})` }
    row.getCell(9).value = { formula: `H${rowNumber}*${CCSS_RATE}` }
    row.getCell(10).value = { formula: `H${rowNumber}-I${rowNumber}` }
    for (let col = 3; col <= 10; col += 1) {
      row.getCell(col).numFmt = MONEY_FORMAT
    }
  })

  ws.columns.forEach((column, index) => {
    column.width = index === 1 ? 32 : 18
  })

  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}

export interface ParsePlanillaResult {
  rows: PlanillaRowInput[]
  errors: PlanillaRowError[]
}

/** Valor plano de una celda: resuelve fórmulas a su resultado y texto enriquecido a string. */
function cellValue(cell: ExcelJS.Cell): RawCell {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object') {
    if (
      'result' in value &&
      (typeof value.result === 'number' || typeof value.result === 'string')
    ) {
      return value.result
    }
    if ('richText' in value) {
      return value.richText.map((part) => part.text).join('')
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text
    }
  }
  return String(value)
}

/** Lee el Excel subido y devuelve filas normalizadas + errores por fila. */
export async function parsePlanillaWorkbook(buffer: ArrayBuffer): Promise<ParsePlanillaResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0]
  if (!ws) {
    return { rows: [], errors: [{ fila: 0, mensaje: 'El archivo no tiene hojas legibles.' }] }
  }

  const rows: PlanillaRowInput[] = []
  const errors: PlanillaRowError[] = []
  const cedulasVistas = new Set<string>()

  for (let rowNumber = HEADER_ROW + 1; rowNumber <= ws.rowCount; rowNumber += 1) {
    const row = ws.getRow(rowNumber)
    const result = parsePlanillaRow(rowNumber, cellValue(row.getCell(1)), {
      base: cellValue(row.getCell(3)),
      feriado: cellValue(row.getCell(4)),
      comision: cellValue(row.getCell(5)),
      horasExtra: cellValue(row.getCell(6)),
      ajuste: cellValue(row.getCell(7)),
    })

    if (result.ok === 'empty') continue
    if (!result.ok) {
      errors.push(result.error)
      continue
    }

    if (cedulasVistas.has(result.row.cedula)) {
      errors.push({ fila: rowNumber, mensaje: `Cédula repetida: ${result.row.cedula}.` })
      continue
    }

    cedulasVistas.add(result.row.cedula)
    rows.push(result.row)
  }

  return { rows, errors }
}
