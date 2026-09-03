import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { buildPlanillaTemplate, parsePlanillaWorkbook } from './planillaExcel'
import type { ConceptoPlanillaColumna } from './planilla'

// planillaExcel.ts importa 'server-only' (lanza error si se carga fuera de un
// entorno de servidor — este test corre en jsdom). Next.js lo neutraliza vía
// alias de webpack en producción; en el test se mockea como no-op para poder
// probar buildPlanillaTemplate/parsePlanillaWorkbook de verdad. vi.mock se
// "hoistea" arriba de los imports automáticamente, así que el orden aquí no
// importa.
vi.mock('server-only', () => ({}))

// Catálogo de prueba: dos ingresos manuales, una deducción manual, una hora
// extra automática y una deducción porcentual — cubre los 4 tipos de
// con_tipo_calculo que puede tener un concepto activo.
const CONCEPTOS: ConceptoPlanillaColumna[] = [
  {
    con_id: 1,
    con_codigo: 'BASE',
    con_nombre: 'Salario base',
    con_tipo: 'ingreso',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
  {
    con_id: 2,
    con_codigo: 'COMISION',
    con_nombre: 'Comisión',
    con_tipo: 'ingreso',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
  {
    con_id: 3,
    con_codigo: 'PRESTAMO',
    con_nombre: 'Préstamo',
    con_tipo: 'deduccion',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_deduccion',
    con_porcentaje: null,
  },
  {
    con_id: 4,
    con_codigo: 'HORAS_EXTRA',
    con_nombre: 'Horas extra',
    con_tipo: 'ingreso',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'horas_extra_automatico',
    con_porcentaje: 150,
  },
  {
    con_id: 5,
    con_codigo: 'CCSS_OBRERA',
    con_nombre: 'Rebajo CCSS',
    con_tipo: 'deduccion',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'porcentaje_deduccion_bruto',
    con_porcentaje: 10.83,
  },
]

const EMPLEADOS = [
  { cedula: '1-1111-1111', nombre: 'Ana Mora', salarioBaseMensual: 600000 },
  { cedula: '2-2222-2222', nombre: 'Beto Solís', salarioBaseMensual: 300000 },
]

const PERIODO_ID = 42

const INFO = {
  titulo: 'Planilla de prueba',
  subtitulo: 'Sucursal Central',
  periodoId: PERIODO_ID,
}

describe('buildPlanillaTemplate + parsePlanillaWorkbook (round trip)', () => {
  it('arma una columna por cada concepto de tipo "monto manual" y las prellena', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)
    const ws = wb.getWorksheet('Planilla')!

    const headerRow = ws.getRow(4)
    const headerLabels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(
      (col) => headerRow.getCell(col).value
    )

    expect(headerLabels).toEqual([
      'Cédula',
      'Empleado',
      'Horas trabajadas',
      'Salario por hora',
      'Salario base',
      'Comisión',
      'Préstamo',
      'Horas extra (calculado)',
      'Días por revisar',
      'Total bruto',
      'Rebajo CCSS (10.83%, calculado)',
      'Total deducciones',
      'Total neto',
    ])

    // Fila del primer empleado (Ana, salario base mensual 600000)
    const fila5 = ws.getRow(5)
    expect(fila5.getCell(1).value).toBe('1-1111-1111')
    expect(fila5.getCell(2).value).toBe('Ana Mora')
    expect(fila5.getCell(3).value).toBe(88) // horas trabajadas por defecto = tope normal
    expect(fila5.getCell(4).value).toBe(3409.09) // 600000 / 2 / 88, redondeado
    expect(fila5.getCell(5).value).toBe(300000) // BASE = mitad del salario mensual
    expect(fila5.getCell(6).value).toBe(0) // COMISION en cero por defecto
    expect(fila5.getCell(7).value).toBe(0) // PRESTAMO en cero por defecto
  })

  it('lee de vuelta los valores prellenados sin que el usuario edite nada', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)
    const { rows, errors } = await parsePlanillaWorkbook(buffer.buffer, CONCEPTOS, PERIODO_ID)

    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)

    expect(rows[0]).toEqual({
      cedula: '1-1111-1111',
      horasTrabajadas: 88,
      salarioPorHora: 3409.09,
      montos: { BASE: 300000, COMISION: 0, PRESTAMO: 0 },
    })
    expect(rows[1]).toEqual({
      cedula: '2-2222-2222',
      horasTrabajadas: 88,
      salarioPorHora: 1704.55, // 300000 / 2 / 88
      montos: { BASE: 150000, COMISION: 0, PRESTAMO: 0 },
    })
  })

  it('detecta los valores que el usuario edita a mano (comisión, horas extra trabajadas, préstamo)', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)
    const ws = wb.getWorksheet('Planilla')!

    // Simula que el usuario edita la fila de Ana: le pone comisión, un
    // préstamo, y reporta 96 horas trabajadas (8 de extra).
    const fila5 = ws.getRow(5)
    fila5.getCell(3).value = 96 // horas trabajadas
    fila5.getCell(6).value = 26250 // comisión
    fila5.getCell(7).value = 10000 // préstamo

    const buffer2 = await wb.xlsx.writeBuffer()
    const { rows, errors } = await parsePlanillaWorkbook(
      new Uint8Array(buffer2).buffer,
      CONCEPTOS,
      PERIODO_ID
    )

    expect(errors).toEqual([])
    const ana = rows.find((r) => r.cedula === '1-1111-1111')
    expect(ana).toEqual({
      cedula: '1-1111-1111',
      horasTrabajadas: 96,
      salarioPorHora: 3409.09,
      montos: { BASE: 300000, COMISION: 26250, PRESTAMO: 10000 },
    })
  })

  it('ignora columnas calculadas: no importa qué tengan escrito, no se leen', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)
    const ws = wb.getWorksheet('Planilla')!

    // "Total neto" (columna 13) trae una fórmula; forzamos un valor rarísimo
    // ahí para probar que el parseo ni siquiera la mira.
    ws.getRow(5).getCell(13).value = 999999999

    const buffer2 = await wb.xlsx.writeBuffer()
    const { rows } = await parsePlanillaWorkbook(
      new Uint8Array(buffer2).buffer,
      CONCEPTOS,
      PERIODO_ID
    )

    const ana = rows.find((r) => r.cedula === '1-1111-1111')
    expect(ana?.montos).toEqual({ BASE: 300000, COMISION: 0, PRESTAMO: 0 })
  })

  it('rechaza montos negativos escritos a mano', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)
    const ws = wb.getWorksheet('Planilla')!

    ws.getRow(5).getCell(6).value = -500 // comisión negativa

    const buffer2 = await wb.xlsx.writeBuffer()
    const { rows, errors } = await parsePlanillaWorkbook(
      new Uint8Array(buffer2).buffer,
      CONCEPTOS,
      PERIODO_ID
    )

    expect(rows).toHaveLength(1) // solo la fila de Ana falla
    expect(errors).toHaveLength(1)
    expect(errors[0].mensaje).toContain('Comisión')
  })
})

// ── Procedencia del archivo ────────────────────────────────────────────────
// Antes, cualquier .xlsx con encabezados parecidos se aceptaba, y una columna
// que no calzara contaba como 0 sin avisar. Estos casos son los que producian
// planillas en cero "sin ningun error".
describe('parsePlanillaWorkbook: archivos que no corresponden', () => {
  it('rechaza un archivo que no es la plantilla del sistema', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Planilla')
    ws.getCell('A4').value = 'Cédula'

    const buffer = await wb.xlsx.writeBuffer()
    const { rows, errors } = await parsePlanillaWorkbook(
      new Uint8Array(buffer).buffer,
      CONCEPTOS,
      PERIODO_ID
    )

    expect(rows).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].mensaje).toContain('no es la plantilla que genera el sistema')
  })

  it('rechaza la plantilla de otro periodo', async () => {
    const buffer = await buildPlanillaTemplate(
      { ...INFO, periodoId: PERIODO_ID + 1 },
      EMPLEADOS,
      CONCEPTOS
    )

    const { rows, errors } = await parsePlanillaWorkbook(buffer.buffer, CONCEPTOS, PERIODO_ID)

    expect(rows).toEqual([])
    expect(errors[0].mensaje).toContain(`periodo ${PERIODO_ID + 1}`)
  })

  it('rechaza la plantilla si el catálogo cambió después de descargarla', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)

    // El encargado corrige el porcentaje de la CCSS obrera en el catálogo y
    // vuelve a subir el MISMO archivo: sus columnas ya no corresponden.
    const catalogoNuevo = CONCEPTOS.map((c) =>
      c.con_codigo === 'CCSS_OBRERA' ? { ...c, con_porcentaje: 10.5 } : c
    )

    const { rows, errors } = await parsePlanillaWorkbook(buffer.buffer, catalogoNuevo, PERIODO_ID)

    expect(rows).toEqual([])
    expect(errors[0].mensaje).toContain('cambiaron desde que se descargó')
  })

  it('rechaza el archivo entero si le falta una columna obligatoria, en vez de leerla como 0', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)
    const ws = wb.getWorksheet('Planilla')!

    // Alguien borra el encabezado de "Horas trabajadas" al editar. Antes esto
    // guardaba a TODA la sucursal con 0 horas y respondía "Planilla guardada".
    ws.getRow(4).getCell(3).value = null

    const buffer2 = await wb.xlsx.writeBuffer()
    const { rows, errors } = await parsePlanillaWorkbook(
      new Uint8Array(buffer2).buffer,
      CONCEPTOS,
      PERIODO_ID
    )

    expect(rows).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].mensaje).toContain('Horas trabajadas')
  })

  it('rechaza el archivo si se borra la columna de un concepto', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)
    const ws = wb.getWorksheet('Planilla')!

    ws.getRow(4).getCell(7).value = null // encabezado "Préstamo"

    const buffer2 = await wb.xlsx.writeBuffer()
    const { errors } = await parsePlanillaWorkbook(
      new Uint8Array(buffer2).buffer,
      CONCEPTOS,
      PERIODO_ID
    )

    expect(errors).toHaveLength(1)
    expect(errors[0].mensaje).toContain('Préstamo')
  })
})

// La plantilla dejo de suponer que todos trabajaron la jornada completa: las
// horas salen de las marcas del kiosco y el base se prorratea sobre ellas.
describe('buildPlanillaTemplate: horas reales de asistencia', () => {
  it('prorratea el salario base según las horas cumplidas', async () => {
    const buffer = await buildPlanillaTemplate(
      INFO,
      [
        {
          ...EMPLEADOS[0],
          horas: { trabajadas: 44, esperadas: 88, salarioPorHora: 3409.09, diasPorRevisar: 2 },
        },
      ],
      CONCEPTOS
    )

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)
    const fila = wb.getWorksheet('Planilla')!.getRow(5)

    expect(fila.getCell(3).value).toBe(44) // horas trabajadas reales
    expect(fila.getCell(4).value).toBe(3409.09) // valor hora prorrateado
    expect(fila.getCell(5).value).toBe(150000) // media jornada = medio salario
    expect(fila.getCell(9).value).toBe(2) // días por revisar
  })

  it('cumplir la jornada completa prellena el base exacto, sin arrastre de redondeo', async () => {
    const buffer = await buildPlanillaTemplate(
      INFO,
      [
        {
          ...EMPLEADOS[0],
          horas: { trabajadas: 88, esperadas: 88, salarioPorHora: 3409.09, diasPorRevisar: 0 },
        },
      ],
      CONCEPTOS
    )

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)

    // 88 x 3409.09 daria 299999.92: el base se prorratea sobre el mensual, no
    // se reconstruye multiplicando la hora redondeada.
    expect(wb.getWorksheet('Planilla')!.getRow(5).getCell(5).value).toBe(300000)
  })

  it('sin lectura de marcas mantiene el supuesto anterior de jornada completa', async () => {
    const buffer = await buildPlanillaTemplate(INFO, EMPLEADOS, CONCEPTOS)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer.buffer)
    const fila = wb.getWorksheet('Planilla')!.getRow(5)

    expect(fila.getCell(3).value).toBe(88)
    expect(fila.getCell(5).value).toBe(300000)
    expect(fila.getCell(9).value).toBe(0)
  })
})
