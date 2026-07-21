import { describe, expect, it } from 'vitest'
import {
  computeTotales,
  construirLineas,
  montosDeFila,
  parsePlanillaRow,
  sameRowValues,
  CCSS_RATE,
} from './planilla'

const ROW_BASE = { base: 180000, feriado: 0, comision: 26250, horasExtra: 0, ajuste: 4250 }

describe('computeTotales', () => {
  it('replica las fórmulas del machote (bruto, CCSS 10,83%, neto)', () => {
    const totales = computeTotales({ cedula: '1-1111-1111', ...ROW_BASE })

    // Valores del machote real: Polifuncional 1, 1ra quincena
    expect(totales.salarioBruto).toBe(210500)
    expect(totales.deduccionCcss).toBe(22797.15)
    expect(totales.salarioNeto).toBe(187702.85)
  })

  it('bruto cero produce deducción y neto cero', () => {
    const totales = computeTotales({
      cedula: 'x',
      base: 0,
      feriado: 0,
      comision: 0,
      horasExtra: 0,
      ajuste: 0,
    })

    expect(totales).toEqual({ salarioBruto: 0, deduccionCcss: 0, salarioNeto: 0 })
  })

  it('redondea a 2 decimales', () => {
    const totales = computeTotales({
      cedula: 'x',
      base: 100000.555,
      feriado: 0,
      comision: 0,
      horasExtra: 0,
      ajuste: 0,
    })

    expect(totales.salarioBruto).toBe(100000.56)
    expect(totales.deduccionCcss).toBe(Math.round(100000.56 * CCSS_RATE * 100) / 100)
  })
})

describe('parsePlanillaRow', () => {
  const montos = { base: 180000, feriado: 0, comision: 0, horasExtra: 0, ajuste: 0 }

  it('acepta una fila válida y normaliza la cédula', () => {
    const result = parsePlanillaRow(5, ' 1-1111-1111 ', montos)

    expect(result.ok).toBe(true)
    if (result.ok === true) {
      expect(result.row.cedula).toBe('1-1111-1111')
      expect(result.row.base).toBe(180000)
    }
  })

  it('ignora filas totalmente vacías', () => {
    const result = parsePlanillaRow(9, null, {
      base: null,
      feriado: null,
      comision: null,
      horasExtra: null,
      ajuste: null,
    })

    expect(result.ok).toBe('empty')
  })

  it('trata montos vacíos como cero', () => {
    const result = parsePlanillaRow(5, '1-1111-1111', {
      base: 180000,
      feriado: null,
      comision: '',
      horasExtra: undefined,
      ajuste: 0,
    })

    expect(result.ok).toBe(true)
    if (result.ok === true) {
      expect(result.row.feriado).toBe(0)
      expect(result.row.comision).toBe(0)
      expect(result.row.horasExtra).toBe(0)
    }
  })

  it('acepta montos con formato de texto (separadores y colones)', () => {
    const result = parsePlanillaRow(5, '1-1111-1111', { ...montos, base: '₡180,000' })

    expect(result.ok).toBe(true)
    if (result.ok === true) {
      expect(result.row.base).toBe(180000)
    }
  })

  it('rechaza montos negativos', () => {
    const result = parsePlanillaRow(7, '1-1111-1111', { ...montos, ajuste: -100 })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.fila).toBe(7)
      expect(result.error.mensaje).toContain('ajuste')
    }
  })

  it('rechaza montos no numéricos', () => {
    const result = parsePlanillaRow(6, '1-1111-1111', { ...montos, base: 'abc' })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.mensaje).toContain('base')
    }
  })

  it('rechaza fila con montos pero sin cédula', () => {
    const result = parsePlanillaRow(8, '', montos)

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.mensaje).toContain('cédula')
    }
  })
})

describe('sameRowValues', () => {
  const BASE = { base: 180000, feriado: 0, comision: 26250, horasExtra: 0, ajuste: 4250 }

  it('es true cuando todos los montos coinciden', () => {
    expect(sameRowValues(BASE, { ...BASE })).toBe(true)
  })

  it('es false si cambia un solo monto', () => {
    expect(sameRowValues(BASE, { ...BASE, comision: 30000 })).toBe(false)
  })

  it('es false si un campo pasó de tener valor a cero', () => {
    expect(sameRowValues(BASE, { ...BASE, ajuste: 0 })).toBe(false)
  })

  it('es true para dos filas en cero', () => {
    const ceros = { base: 0, feriado: 0, comision: 0, horasExtra: 0, ajuste: 0 }
    expect(sameRowValues(ceros, { ...ceros })).toBe(true)
  })
})

describe('montosDeFila', () => {
  it('reordena los campos por código de concepto', () => {
    const montos = montosDeFila({
      base: 100,
      feriado: 200,
      comision: 300,
      horasExtra: 400,
      ajuste: 500,
    })

    expect(montos).toEqual({
      BASE: 100,
      FERIADO: 200,
      COMISION: 300,
      HORAS_EXTRA: 400,
      AJUSTE: 500,
    })
  })
})

describe('construirLineas', () => {
  const conceptoId = new Map([
    ['BASE', 1],
    ['FERIADO', 2],
    ['COMISION', 3],
    ['HORAS_EXTRA', 4],
    ['AJUSTE', 5],
    ['CCSS_OBRERA', 6],
  ])

  it('omite los ingresos en cero y siempre incluye la deducción de CCSS', () => {
    const { ingresos, deduccion } = construirLineas(
      { base: 180000, feriado: 0, comision: 26250, horasExtra: 0, ajuste: 4250 },
      99,
      conceptoId
    )

    expect(ingresos).toEqual([
      { ing_nomina_detalle_id: 99, ing_concepto_id: 1, ing_monto: 180000 },
      { ing_nomina_detalle_id: 99, ing_concepto_id: 3, ing_monto: 26250 },
      { ing_nomina_detalle_id: 99, ing_concepto_id: 5, ing_monto: 4250 },
    ])
    expect(deduccion).toEqual({
      ded_nomina_detalle_id: 99,
      ded_concepto_id: 6,
      ded_porcentaje_aplicado: 10.83,
      ded_base_calculo: 210500,
      ded_monto: 22797.15,
    })
  })

  it('devuelve un arreglo de ingresos vacío cuando todos los montos son cero', () => {
    const { ingresos, deduccion } = construirLineas(
      { base: 0, feriado: 0, comision: 0, horasExtra: 0, ajuste: 0 },
      5,
      conceptoId
    )

    expect(ingresos).toEqual([])
    expect(deduccion.ded_monto).toBe(0)
  })
})
