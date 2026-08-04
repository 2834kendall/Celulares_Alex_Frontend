// Generación y lectura del Excel de planilla (machote del cliente).
// Solo servidor: exceljs no debe llegar al bundle del navegador.
//
// Las columnas del archivo son DINÁMICAS: una por cada concepto activo del
// catálogo de tipo "monto manual" (ingreso o deducción). Los conceptos de
// "% del bruto" (ej. CCSS) y "horas extra automático" no son columnas — se
// calculan solos a partir de "Horas trabajadas" y "Salario por hora", igual
// que en la edición manual del detalle. Si mañana se crea un concepto nuevo
// en el catálogo, aparece solo en la próxima plantilla que se descargue.

import 'server-only'
import ExcelJS from 'exceljs'
import {
  TOPE_HORAS_NORMALES_QUINCENAL,
  agruparConceptosPlanilla,
  parsePlanillaRow,
  type ConceptoPlanillaColumna,
  type PlanillaRowError,
  type PlanillaRowInput,
  type RawCell,
} from './planilla'

const SHEET_NAME = 'Planilla'
const HEADER_ROW = 4
const MONEY_FORMAT = '#,##0.00'
const HOURS_FORMAT = '0.00'
const COLOR_HEADER_EDITABLE = 'FF1D4ED8'
const COLOR_HEADER_CALCULADO = 'FF64748B'
const COLOR_CALCULADO_FILL = 'FFF1F5F9'

const LABEL_CEDULA = 'Cédula'
const LABEL_EMPLEADO = 'Empleado'
const LABEL_HORAS = 'Horas trabajadas'
const LABEL_SALARIO_HORA = 'Salario por hora'
const LABEL_TOTAL_BRUTO = 'Total bruto'
const LABEL_TOTAL_DEDUCCIONES = 'Total deducciones'
const LABEL_TOTAL_NETO = 'Total neto'

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

/** Convierte un índice de columna 1-based a su letra de Excel (1 → A, 27 → AA). */
function columnLetter(index: number): string {
  let letter = ''
  let n = index
  while (n > 0) {
    const rem = (n - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

/**
 * Construye la plantilla: una fila por empleado activo, con una columna
 * editable por cada concepto "monto manual" activo del catálogo, más
 * "Horas trabajadas" y "Salario por hora" (para que las horas extra se
 * calculen solas). Las columnas calculadas (horas extra, % de bruto,
 * totales) van sombreadas en gris — no se editan, el servidor las recalcula
 * siempre al subir el archivo, las fórmulas son solo ayuda visual.
 */
export async function buildPlanillaTemplate(
  info: PlantillaInfo,
  empleados: EmpleadoPlantilla[],
  conceptos: ConceptoPlanillaColumna[]
): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(SHEET_NAME)

  const { ingresoManual, deduccionManual, horasExtra, deduccionPorcentual } =
    agruparConceptosPlanilla(conceptos)

  const headers: { label: string; editable: boolean }[] = [
    { label: LABEL_CEDULA, editable: false },
    { label: LABEL_EMPLEADO, editable: false },
    { label: LABEL_HORAS, editable: true },
    { label: LABEL_SALARIO_HORA, editable: true },
    ...ingresoManual.map((c) => ({ label: c.con_nombre, editable: true })),
    ...deduccionManual.map((c) => ({ label: c.con_nombre, editable: true })),
    ...horasExtra.map((c) => ({ label: `${c.con_nombre} (calculado)`, editable: false })),
    { label: LABEL_TOTAL_BRUTO, editable: false },
    ...deduccionPorcentual.map((c) => ({
      label: `${c.con_nombre} (${c.con_porcentaje ?? 0}%, calculado)`,
      editable: false,
    })),
    { label: LABEL_TOTAL_DEDUCCIONES, editable: false },
    { label: LABEL_TOTAL_NETO, editable: false },
  ]

  const colCedula = 1
  const colHoras = 3
  const colSalarioHora = 4
  const colIngresoInicio = 5
  const colDeduccionManualInicio = colIngresoInicio + ingresoManual.length
  const colHorasExtraInicio = colDeduccionManualInicio + deduccionManual.length
  const colTotalBruto = colHorasExtraInicio + horasExtra.length
  const colDeduccionPctInicio = colTotalBruto + 1
  const colTotalDeducciones = colDeduccionPctInicio + deduccionPorcentual.length
  const colTotalNeto = colTotalDeducciones + 1

  ws.getCell('A1').value = info.titulo
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = info.subtitulo
  ws.getCell('A2').font = { color: { argb: 'FF64748B' }, size: 10 }
  ws.getCell('A3').value =
    'Edita solo las columnas azules (montos, horas y salario por hora). No cambies la cédula ni agregues columnas — las columnas grises se calculan solas.'
  ws.getCell('A3').font = { color: { argb: 'FFB45309' }, size: 10 }

  const headerRow = ws.getRow(HEADER_ROW)
  headers.forEach((h, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = h.label
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: h.editable ? COLOR_HEADER_EDITABLE : COLOR_HEADER_CALCULADO },
    }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  headerRow.height = 30

  empleados.forEach((emp, index) => {
    const rowNumber = HEADER_ROW + 1 + index
    const row = ws.getRow(rowNumber)
    row.getCell(colCedula).value = emp.cedula
    row.getCell(2).value = emp.nombre
    row.getCell(colHoras).value = TOPE_HORAS_NORMALES_QUINCENAL
    row.getCell(colSalarioHora).value =
      Math.round((emp.salarioBaseMensual / 2 / TOPE_HORAS_NORMALES_QUINCENAL) * 100) / 100

    ingresoManual.forEach((c, i) => {
      const monto =
        c.con_codigo === 'BASE' ? Math.round((emp.salarioBaseMensual / 2) * 100) / 100 : 0
      row.getCell(colIngresoInicio + i).value = monto
    })
    deduccionManual.forEach((_, i) => {
      row.getCell(colDeduccionManualInicio + i).value = 0
    })

    const letraHoras = columnLetter(colHoras)
    const letraSalarioHora = columnLetter(colSalarioHora)

    horasExtra.forEach((c, i) => {
      const col = colHorasExtraInicio + i
      const factor = (c.con_porcentaje ?? 0) / 100
      row.getCell(col).value = {
        formula: `MAX(0,${letraHoras}${rowNumber}-${TOPE_HORAS_NORMALES_QUINCENAL})*${letraSalarioHora}${rowNumber}*${factor}`,
      }
    })

    const rango = (inicio: number, cantidad: number) =>
      cantidad > 0
        ? `${columnLetter(inicio)}${rowNumber}:${columnLetter(inicio + cantidad - 1)}${rowNumber}`
        : null

    const sumandosBruto = [
      rango(colIngresoInicio, ingresoManual.length),
      rango(colHorasExtraInicio, horasExtra.length),
    ].filter((r): r is string => r !== null)
    row.getCell(colTotalBruto).value = {
      formula: sumandosBruto.length > 0 ? `SUM(${sumandosBruto.join(',')})` : '0',
    }

    const letraBruto = columnLetter(colTotalBruto)
    deduccionPorcentual.forEach((c, i) => {
      const col = colDeduccionPctInicio + i
      const factor = (c.con_porcentaje ?? 0) / 100
      row.getCell(col).value = { formula: `${letraBruto}${rowNumber}*${factor}` }
    })

    const sumandosDeducciones = [
      rango(colDeduccionManualInicio, deduccionManual.length),
      rango(colDeduccionPctInicio, deduccionPorcentual.length),
    ].filter((r): r is string => r !== null)
    row.getCell(colTotalDeducciones).value = {
      formula: sumandosDeducciones.length > 0 ? `SUM(${sumandosDeducciones.join(',')})` : '0',
    }

    const letraDeducciones = columnLetter(colTotalDeducciones)
    row.getCell(colTotalNeto).value = {
      formula: `${letraBruto}${rowNumber}-${letraDeducciones}${rowNumber}`,
    }

    for (let col = colSalarioHora; col <= colTotalNeto; col += 1) {
      row.getCell(col).numFmt = MONEY_FORMAT
    }
    row.getCell(colHoras).numFmt = HOURS_FORMAT

    for (let col = colHorasExtraInicio; col <= colTotalNeto; col += 1) {
      row.getCell(col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR_CALCULADO_FILL },
      }
    }
  })

  // getColumn (no `ws.columns`): la propiedad `columns` solo queda poblada si
  // se asigna explícitamente antes, y aquí las columnas se llenan celda a
  // celda — iterar `ws.columns` puede fallar silenciosamente o lanzar.
  headers.forEach((h, index) => {
    ws.getColumn(index + 1).width =
      index === 1 ? 28 : Math.max(16, Math.min(26, h.label.length + 2))
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

/**
 * Ubica la fila del encabezado buscando la etiqueta "Cédula" en la columna A
 * (las primeras 20 filas). Así el parseo tolera que el usuario inserte o
 * borre una fila por accidente al editar — no depende de que el encabezado
 * siga exactamente en la fila 4. Si no la encuentra, usa HEADER_ROW.
 */
function locateHeaderRow(ws: ExcelJS.Worksheet): number {
  const maxScan = Math.min(ws.rowCount, 20)
  for (let rowNumber = 1; rowNumber <= maxScan; rowNumber += 1) {
    const value = cellValue(ws.getRow(rowNumber).getCell(1))
    if (typeof value === 'string' && value.trim() === LABEL_CEDULA) {
      return rowNumber
    }
  }
  return HEADER_ROW
}

/** Busca en la fila de encabezado la columna cuyo texto coincide exactamente con `label`. */
function locateColumn(headerRow: ExcelJS.Row, label: string, maxCol: number): number | null {
  for (let col = 1; col <= maxCol; col += 1) {
    const value = cellValue(headerRow.getCell(col))
    if (typeof value === 'string' && value.trim() === label) return col
  }
  return null
}

/**
 * Lee el Excel subido y devuelve filas normalizadas + errores por fila.
 * `conceptos` debe ser la lista de conceptos activos del catálogo (la misma
 * que se usó para generar la plantilla) — a partir de ella se ubican las
 * columnas de monto manual por el nombre del concepto. Si un concepto ya no
 * tiene columna en el archivo (por ejemplo, se creó después de descargar la
 * plantilla), su monto cuenta como 0 para esa fila.
 */
export async function parsePlanillaWorkbook(
  buffer: ArrayBuffer,
  conceptos: ConceptoPlanillaColumna[]
): Promise<ParsePlanillaResult> {
  const wb = new ExcelJS.Workbook()

  try {
    await wb.xlsx.load(buffer)
  } catch {
    return {
      rows: [],
      errors: [
        {
          fila: 0,
          mensaje:
            'El archivo no es un Excel válido (.xlsx) o está dañado. Descarga la plantilla de nuevo y vuelve a intentar.',
        },
      ],
    }
  }

  const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0]
  if (!ws) {
    return { rows: [], errors: [{ fila: 0, mensaje: 'El archivo no tiene hojas legibles.' }] }
  }

  const { ingresoManual, deduccionManual } = agruparConceptosPlanilla(conceptos)
  const columnasMontoDef = [...ingresoManual, ...deduccionManual]

  const headerRowNumber = locateHeaderRow(ws)
  const headerRow = ws.getRow(headerRowNumber)
  const maxCol = Math.max(ws.columnCount, headerRow.actualCellCount, columnasMontoDef.length + 20)

  const colCedula = locateColumn(headerRow, LABEL_CEDULA, maxCol) ?? 1
  const colHoras = locateColumn(headerRow, LABEL_HORAS, maxCol)
  const colSalarioHora = locateColumn(headerRow, LABEL_SALARIO_HORA, maxCol)

  const columnasMonto = columnasMontoDef.map((c) => ({
    codigo: c.con_codigo,
    etiqueta: c.con_nombre,
    columna: locateColumn(headerRow, c.con_nombre, maxCol),
  }))

  const rows: PlanillaRowInput[] = []
  const errors: PlanillaRowError[] = []
  const cedulasVistas = new Set<string>()

  for (let rowNumber = headerRowNumber + 1; rowNumber <= ws.rowCount; rowNumber += 1) {
    const row = ws.getRow(rowNumber)

    const montosCrudos = columnasMonto.map(({ codigo, etiqueta, columna }) => ({
      codigo,
      etiqueta,
      valor: columna !== null ? cellValue(row.getCell(columna)) : null,
    }))

    const result = parsePlanillaRow(
      rowNumber,
      cellValue(row.getCell(colCedula)),
      colHoras !== null ? cellValue(row.getCell(colHoras)) : null,
      colSalarioHora !== null ? cellValue(row.getCell(colSalarioHora)) : null,
      montosCrudos
    )

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
