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
  firmaCatalogo,
  parsePlanillaRow,
  type ConceptoPlanillaColumna,
  type PlanillaRowError,
  type PlanillaRowInput,
  type RawCell,
} from './planilla'

const SHEET_NAME = 'Planilla'

// Hoja oculta con la procedencia del archivo: de qué periodo salió y con qué
// catálogo se armó. Sin esto, la subida no puede distinguir "el usuario borró
// una columna" de "este concepto se creó después de descargar la plantilla",
// y ante la duda contaba 0 en silencio.
const META_SHEET_NAME = '_sgrh'
const META_VERSION = 1
const META_LABEL_VERSION = 'version'
const META_LABEL_PERIODO = 'periodoId'
const META_LABEL_CATALOGO = 'catalogo'
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
const LABEL_REVISAR = 'Días por revisar'

export interface EmpleadoPlantilla {
  cedula: string
  nombre: string
  /** Salario base mensual del contrato; es el techo de la quincena (la mitad). */
  salarioBaseMensual: number
  /**
   * Horas de la quincena según las marcas del kiosco, y el valor de la hora
   * prorrateado sobre las horas que la persona tenía programadas. Ausente
   * cuando el periodo no tiene fechas o no se pudieron leer las marcas: en ese
   * caso la plantilla vuelve al comportamiento anterior (jornada completa
   * supuesta) para no dejar al encargado sin planilla.
   */
  horas?: {
    trabajadas: number
    esperadas: number
    salarioPorHora: number
    /** Días programados con marcas incompletas; hay que corregirlos antes de pagar. */
    diasPorRevisar: number
  }
}

export interface PlantillaInfo {
  titulo: string
  subtitulo: string
  /** Periodo al que pertenece la plantilla; se sella en la hoja oculta. */
  periodoId: number
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

  // Sello de procedencia. 'veryHidden' para que no se pueda mostrar desde la
  // interfaz de Excel: no es información que el usuario deba tocar.
  const meta = wb.addWorksheet(META_SHEET_NAME, { state: 'veryHidden' })
  meta.getCell('A1').value = META_LABEL_VERSION
  meta.getCell('B1').value = META_VERSION
  meta.getCell('A2').value = META_LABEL_PERIODO
  meta.getCell('B2').value = info.periodoId
  meta.getCell('A3').value = META_LABEL_CATALOGO
  meta.getCell('B3').value = firmaCatalogo(conceptos)

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
    { label: LABEL_REVISAR, editable: false },
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
  const colRevisar = colHorasExtraInicio + horasExtra.length
  const colTotalBruto = colRevisar + 1
  const colDeduccionPctInicio = colTotalBruto + 1
  const colTotalDeducciones = colDeduccionPctInicio + deduccionPorcentual.length
  const colTotalNeto = colTotalDeducciones + 1

  ws.getCell('A1').value = info.titulo
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = info.subtitulo
  ws.getCell('A2').font = { color: { argb: 'FF64748B' }, size: 10 }
  ws.getCell('A3').value =
    'Las horas y el salario por hora vienen de las marcas de asistencia: revísalos antes de subir. Edita solo las columnas azules. No cambies la cédula ni agregues columnas — las columnas grises se calculan solas.'
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
    // Sin lectura de marcas se cae al supuesto anterior: jornada completa.
    const horasTrabajadas = emp.horas?.trabajadas ?? TOPE_HORAS_NORMALES_QUINCENAL
    const salarioPorHora =
      emp.horas?.salarioPorHora ??
      Math.round((emp.salarioBaseMensual / 2 / TOPE_HORAS_NORMALES_QUINCENAL) * 100) / 100

    row.getCell(colHoras).value = horasTrabajadas
    row.getCell(colSalarioHora).value = salarioPorHora
    row.getCell(colRevisar).value = emp.horas?.diasPorRevisar ?? 0

    // Salario base de la quincena: la mitad del mensual, en proporción a las
    // horas cumplidas dentro de la jornada programada.
    //
    // Se prorratea sobre salario_base / 2 y NO multiplicando las horas por el
    // valor de la hora: ese valor va redondeado a dos decimales, y multiplicarlo
    // por 88 horas dejaba a quien cumplió su jornada completa cobrando
    // ¢299.999,92 en vez de ¢300.000. La hora redondeada sirve para las horas
    // extra; el base sale de la proporción.
    //
    // Es un prellenado, no una imposición: el encargado revisa el archivo antes
    // de subirlo.
    const mitadMensual = emp.salarioBaseMensual / 2
    const proporcion =
      emp.horas && emp.horas.esperadas > 0
        ? Math.min(emp.horas.trabajadas, emp.horas.esperadas) / emp.horas.esperadas
        : 1

    ingresoManual.forEach((c, i) => {
      const monto = c.con_codigo === 'BASE' ? Math.round(mitadMensual * proporcion * 100) / 100 : 0
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
    // "Días por revisar" es un conteo, no plata: el formato de moneda que se
    // aplica al bloque de arriba lo mostraría como "2.00".
    row.getCell(colRevisar).numFmt = '0'

    if ((emp.horas?.diasPorRevisar ?? 0) > 0) {
      row.getCell(colRevisar).font = { bold: true, color: { argb: 'FFB91C1C' } }
    }

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
 * Verifica que el archivo sea la plantilla que este sistema genero, para este
 * periodo, y con el catalogo que esta vigente ahora. Devuelve el error a
 * reportar, o null si todo cuadra.
 */
function validarProcedencia(
  wb: ExcelJS.Workbook,
  conceptos: ConceptoPlanillaColumna[],
  periodoId: number
): PlanillaRowError | null {
  const meta = wb.getWorksheet(META_SHEET_NAME)

  if (!meta || cellValue(meta.getCell('B1')) !== META_VERSION) {
    return {
      fila: 0,
      mensaje:
        'El archivo no es la plantilla que genera el sistema (o se guardó en un formato que perdió su información interna). Descarga la plantilla de este periodo y vuelve a intentar.',
    }
  }

  const periodoDelArchivo = Number(cellValue(meta.getCell('B2')))
  if (periodoDelArchivo !== periodoId) {
    return {
      fila: 0,
      mensaje: `Esta plantilla es del periodo ${periodoDelArchivo}, no del que estás subiendo. Descarga la plantilla de este periodo.`,
    }
  }

  const catalogoDelArchivo = String(cellValue(meta.getCell('B3')) ?? '')
  if (catalogoDelArchivo !== firmaCatalogo(conceptos)) {
    return {
      fila: 0,
      mensaje:
        'Los conceptos de nómina cambiaron desde que se descargó esta plantilla, así que sus columnas ya no corresponden. Descarga la plantilla de nuevo y vuelve a llenarla.',
    }
  }

  return null
}

/**
 * Lee el Excel subido y devuelve filas normalizadas + errores por fila.
 * `conceptos` debe ser la lista de conceptos activos del catálogo (la misma
 * que se usó para generar la plantilla) — a partir de ella se ubican las
 * columnas de monto manual por el nombre del concepto. Si al archivo le falta
 * cualquiera de esas columnas se rechaza entero: contarlas como 0 era
 * justamente la forma silenciosa de perder plata que esto viene a evitar.
 */
export async function parsePlanillaWorkbook(
  buffer: ArrayBuffer,
  conceptos: ConceptoPlanillaColumna[],
  periodoId: number
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

  const ws =
    wb.getWorksheet(SHEET_NAME) ?? wb.worksheets.find((hoja) => hoja.name !== META_SHEET_NAME)
  if (!ws) {
    return { rows: [], errors: [{ fila: 0, mensaje: 'El archivo no tiene hojas legibles.' }] }
  }

  const errorArchivo = validarProcedencia(wb, conceptos, periodoId)
  if (errorArchivo) {
    return { rows: [], errors: [errorArchivo] }
  }

  const { ingresoManual, deduccionManual } = agruparConceptosPlanilla(conceptos)
  const columnasMontoDef = [...ingresoManual, ...deduccionManual]

  const headerRowNumber = locateHeaderRow(ws)
  const headerRow = ws.getRow(headerRowNumber)
  const maxCol = Math.max(ws.columnCount, headerRow.actualCellCount, columnasMontoDef.length + 20)

  const colCedula = locateColumn(headerRow, LABEL_CEDULA, maxCol)
  const colHoras = locateColumn(headerRow, LABEL_HORAS, maxCol)
  const colSalarioHora = locateColumn(headerRow, LABEL_SALARIO_HORA, maxCol)

  const columnasMonto = columnasMontoDef.map((c) => ({
    codigo: c.con_codigo,
    etiqueta: c.con_nombre,
    columna: locateColumn(headerRow, c.con_nombre, maxCol),
  }))

  // Una columna que no aparece NO es un 0: es un archivo que no corresponde.
  // Antes se leía como vacío y la planilla se guardaba con ese concepto en
  // cero, o — si lo que faltaba era "Horas trabajadas" — con toda la sucursal
  // en 0 horas, sin un solo mensaje de error.
  //
  // Las tres columnas fijas se comprueban en la misma condición para que
  // TypeScript las estreche a `number` en el resto de la función.
  if (
    colCedula === null ||
    colHoras === null ||
    colSalarioHora === null ||
    columnasMonto.some((c) => c.columna === null)
  ) {
    const faltantes = [
      colCedula === null ? LABEL_CEDULA : null,
      colHoras === null ? LABEL_HORAS : null,
      colSalarioHora === null ? LABEL_SALARIO_HORA : null,
      ...columnasMonto.filter((c) => c.columna === null).map((c) => c.etiqueta),
    ].filter((etiqueta): etiqueta is string => etiqueta !== null)

    return {
      rows: [],
      errors: [
        {
          fila: headerRowNumber,
          mensaje: `Al archivo le faltan columnas obligatorias: ${faltantes.join(', ')}. No cambies ni borres los encabezados; descarga la plantilla de nuevo si hace falta.`,
        },
      ],
    }
  }

  const rows: PlanillaRowInput[] = []
  const errors: PlanillaRowError[] = []
  const cedulasVistas = new Set<string>()

  for (let rowNumber = headerRowNumber + 1; rowNumber <= ws.rowCount; rowNumber += 1) {
    const row = ws.getRow(rowNumber)

    const montosCrudos = columnasMonto.map(({ codigo, etiqueta, columna }) => ({
      codigo,
      etiqueta,
      // El guard de arriba ya garantiza que ninguna quedó en null.
      valor: cellValue(row.getCell(columna!)),
    }))

    const result = parsePlanillaRow(
      rowNumber,
      cellValue(row.getCell(colCedula)),
      cellValue(row.getCell(colHoras)),
      cellValue(row.getCell(colSalarioHora)),
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
