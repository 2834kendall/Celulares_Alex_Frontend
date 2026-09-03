import { describe, expect, it } from 'vitest'
import {
  agruparConceptosPlanilla,
  calcularPlanillaPorConceptos,
  parsePlanillaRow,
  sameRowValues,
  type ConceptoPlanillaColumna,
} from './planilla'

describe('calcularPlanillaPorConceptos', () => {
  const CONCEPTOS = [
    {
      con_id: 1,
      con_codigo: 'BASE',
      con_tipo: 'ingreso',
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'monto_manual_ingreso',
      con_porcentaje: null,
    },
    {
      con_id: 2,
      con_codigo: 'COMISION',
      con_tipo: 'ingreso',
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'monto_manual_ingreso',
      con_porcentaje: null,
    },
    {
      con_id: 3,
      con_codigo: 'PRESTAMO',
      con_tipo: 'deduccion',
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'monto_manual_deduccion',
      con_porcentaje: null,
    },
    {
      con_id: 4,
      con_codigo: 'HORAS_EXTRA',
      con_tipo: 'ingreso',
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'horas_extra_automatico',
      con_porcentaje: 150,
    },
    {
      con_id: 5,
      con_codigo: 'CCSS_OBRERA',
      con_tipo: 'deduccion',
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'porcentaje_deduccion_bruto',
      con_porcentaje: 10.83,
    },
  ]

  it('suma ingresos manuales + horas extra para el bruto, y aplica deducciones sobre ese bruto', () => {
    const resultado = calcularPlanillaPorConceptos(CONCEPTOS, {
      montos: { BASE: 180000, COMISION: 26250, PRESTAMO: 10000 },
      horasTrabajadas: 96, // 8 horas extra sobre el tope de 88
      salarioPorHora: 2500,
    })

    // horas extra: (96-88) * 2500 * 1.5 = 30000
    expect(resultado.salarioBruto).toBe(236250) // 180000 + 26250 + 30000
    // CCSS: 236250 * 10.83% = 25585.875 -> redondeado a 25585.88
    expect(resultado.totalDeducciones).toBe(35585.88) // 10000 (préstamo) + 25585.88 (CCSS)
    expect(resultado.salarioNeto).toBe(200664.12)
  })

  it('sin horas extra (horas trabajadas dentro del tope) no agrega monto de horas extra', () => {
    const resultado = calcularPlanillaPorConceptos(CONCEPTOS, {
      montos: { BASE: 180000 },
      horasTrabajadas: 80,
      salarioPorHora: 2500,
    })

    expect(resultado.lineas.some((l) => l.con_codigo === 'HORAS_EXTRA')).toBe(false)
    expect(resultado.salarioBruto).toBe(180000)
  })

  it('omite líneas en cero (montos ausentes cuentan como 0)', () => {
    const resultado = calcularPlanillaPorConceptos(CONCEPTOS, {
      montos: {},
      horasTrabajadas: 88,
      salarioPorHora: 0,
    })

    expect(resultado.lineas).toEqual([])
    expect(resultado.salarioBruto).toBe(0)
    expect(resultado.totalDeducciones).toBe(0)
    expect(resultado.salarioNeto).toBe(0)
  })
})

// Regresion: en el catalogo real, PAT001 (CCSS Patronal), PAT003 y PAT004
// estan activos con con_tipo = 'patronal' pero con_tipo_calculo =
// 'monto_manual_ingreso'. Como el agrupador y el motor solo miraban
// con_tipo_calculo, salian como columnas azules editables del Excel y, si
// alguien las llenaba, sumaban al salario bruto del trabajador (y le
// aplicaban CCSS obrera encima). No son plata suya: son costo del patrono.
// Regresion: con_afecta_base_ccss existia en el catalogo y estaba bien puesto
// en el seed (ING010 Viaticos y ING005 Aguinaldo en false), pero el motor
// nunca lo leia: aplicaba el porcentaje sobre el bruto completo. Resultado, a
// los viaticos se les rebajaba CCSS obrera como si fueran salario.
describe('base de las deducciones porcentuales', () => {
  const BASE = {
    con_id: 1,
    con_codigo: 'BASE',
    con_tipo: 'ingreso',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  }

  const VIATICOS = {
    con_id: 10,
    con_codigo: 'ING010',
    con_tipo: 'ingreso',
    con_afecta_base_ccss: false,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  }

  const CCSS = {
    con_id: 6,
    con_codigo: 'CCSS_OBRERA',
    con_tipo: 'deduccion',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'porcentaje_deduccion_bruto',
    con_porcentaje: 10.83,
  }

  it('excluye del cálculo los ingresos que no cotizan, pero los paga igual', () => {
    const resultado = calcularPlanillaPorConceptos([BASE, VIATICOS, CCSS], {
      montos: { BASE: 200000, ING010: 50000 },
      horasTrabajadas: 88,
      salarioPorHora: 0,
    })

    // Los viáticos se pagan: entran al bruto y por lo tanto al neto.
    expect(resultado.salarioBruto).toBe(250000)
    // Pero no cotizan: la CCSS se calcula solo sobre los 200000 del salario.
    expect(resultado.baseCcss).toBe(200000)
    expect(resultado.totalDeducciones).toBe(21660) // 200000 * 10,83%
    expect(resultado.salarioNeto).toBe(228340)

    const ccss = resultado.lineas.find((l) => l.con_codigo === 'CCSS_OBRERA')
    expect(ccss?.baseCalculo).toBe(200000)
  })

  it('si todo cotiza, la base y el bruto coinciden (comportamiento de siempre)', () => {
    const resultado = calcularPlanillaPorConceptos([BASE, CCSS], {
      montos: { BASE: 200000 },
      horasTrabajadas: 88,
      salarioPorHora: 0,
    })

    expect(resultado.baseCcss).toBe(resultado.salarioBruto)
    expect(resultado.totalDeducciones).toBe(21660)
  })
})

describe('conceptos patronales', () => {
  const PATRONAL = {
    con_id: 17,
    con_codigo: 'PAT001',
    con_nombre: 'CCSS Patronal (SEM+IVM)',
    con_tipo: 'patronal',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  }

  const BASE = {
    con_id: 1,
    con_codigo: 'BASE',
    con_nombre: 'Salario base',
    con_tipo: 'ingreso',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  }

  it('no suman al bruto ni generan linea, aunque vengan con monto', () => {
    const resultado = calcularPlanillaPorConceptos([BASE, PATRONAL], {
      montos: { BASE: 200000, PAT001: 55000 },
      horasTrabajadas: 88,
      salarioPorHora: 2500,
    })

    expect(resultado.salarioBruto).toBe(200000)
    expect(resultado.lineas.some((l) => l.con_codigo === 'PAT001')).toBe(false)
  })

  it('no aparecen como columna editable de la plantilla', () => {
    const grupos = agruparConceptosPlanilla([BASE, PATRONAL])

    expect(grupos.ingresoManual.map((c) => c.con_codigo)).toEqual(['BASE'])
    expect(grupos.deduccionManual).toEqual([])
  })
})

describe('agruparConceptosPlanilla', () => {
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
      con_codigo: 'PRESTAMO',
      con_nombre: 'Préstamo',
      con_tipo: 'deduccion',
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'monto_manual_deduccion',
      con_porcentaje: null,
    },
    {
      con_id: 3,
      con_codigo: 'HORAS_EXTRA',
      con_nombre: 'Horas extra',
      con_tipo: 'ingreso',
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'horas_extra_automatico',
      con_porcentaje: 150,
    },
    {
      con_id: 4,
      con_codigo: 'CCSS_OBRERA',
      con_nombre: 'Rebajo CCSS',
      con_tipo: 'deduccion',
      con_afecta_base_ccss: true,
      con_tipo_calculo: 'porcentaje_deduccion_bruto',
      con_porcentaje: 10.83,
    },
  ]

  it('separa los conceptos en los 4 grupos según con_tipo_calculo', () => {
    const grupos = agruparConceptosPlanilla(CONCEPTOS)

    expect(grupos.ingresoManual.map((c) => c.con_codigo)).toEqual(['BASE'])
    expect(grupos.deduccionManual.map((c) => c.con_codigo)).toEqual(['PRESTAMO'])
    expect(grupos.horasExtra.map((c) => c.con_codigo)).toEqual(['HORAS_EXTRA'])
    expect(grupos.deduccionPorcentual.map((c) => c.con_codigo)).toEqual(['CCSS_OBRERA'])
  })
})

describe('parsePlanillaRow', () => {
  const columnas = (montos: Record<string, unknown>) =>
    Object.entries(montos).map(([codigo, valor]) => ({
      codigo,
      etiqueta: codigo,
      valor: valor as string | number | null | undefined,
    }))

  it('acepta una fila válida y normaliza la cédula', () => {
    const result = parsePlanillaRow(5, ' 1-1111-1111 ', 88, 2500, columnas({ BASE: 180000 }))

    expect(result.ok).toBe(true)
    if (result.ok === true) {
      expect(result.row.cedula).toBe('1-1111-1111')
      expect(result.row.horasTrabajadas).toBe(88)
      expect(result.row.salarioPorHora).toBe(2500)
      expect(result.row.montos).toEqual({ BASE: 180000 })
    }
  })

  it('ignora filas totalmente vacías', () => {
    const result = parsePlanillaRow(9, null, null, null, columnas({ BASE: null, COMISION: '' }))

    expect(result.ok).toBe('empty')
  })

  it('trata montos vacíos como cero', () => {
    const result = parsePlanillaRow(
      5,
      '1-1111-1111',
      88,
      2500,
      columnas({ BASE: 180000, COMISION: null })
    )

    expect(result.ok).toBe(true)
    if (result.ok === true) {
      expect(result.row.montos.COMISION).toBe(0)
    }
  })

  it('acepta montos con formato de texto (separadores y colones)', () => {
    const result = parsePlanillaRow(5, '1-1111-1111', 88, 2500, columnas({ BASE: '₡180,000' }))

    expect(result.ok).toBe(true)
    if (result.ok === true) {
      expect(result.row.montos.BASE).toBe(180000)
    }
  })

  it('rechaza montos negativos', () => {
    const result = parsePlanillaRow(7, '1-1111-1111', 88, 2500, columnas({ AJUSTE: -100 }))

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.fila).toBe(7)
      expect(result.error.mensaje).toContain('AJUSTE')
    }
  })

  it('rechaza montos no numéricos', () => {
    const result = parsePlanillaRow(6, '1-1111-1111', 88, 2500, columnas({ BASE: 'abc' }))

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.mensaje).toContain('BASE')
    }
  })

  it('rechaza horas trabajadas negativas', () => {
    const result = parsePlanillaRow(6, '1-1111-1111', -5, 2500, columnas({}))

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.mensaje).toContain('horas trabajadas')
    }
  })

  it('rechaza salario por hora no numérico', () => {
    const result = parsePlanillaRow(6, '1-1111-1111', 88, 'abc', columnas({}))

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.mensaje).toContain('salario por hora')
    }
  })

  it('rechaza fila con montos pero sin cédula', () => {
    const result = parsePlanillaRow(8, '', 88, 2500, columnas({ BASE: 1000 }))

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.mensaje).toContain('cédula')
    }
  })
})

describe('sameRowValues', () => {
  const BASE = {
    horasTrabajadas: 88,
    salarioPorHora: 2500,
    montos: { BASE: 180000, COMISION: 26250 },
  }

  it('es true cuando todos los valores coinciden', () => {
    expect(sameRowValues(BASE, { ...BASE, montos: { ...BASE.montos } })).toBe(true)
  })

  it('es false si cambia un monto', () => {
    expect(sameRowValues(BASE, { ...BASE, montos: { ...BASE.montos, COMISION: 30000 } })).toBe(
      false
    )
  })

  it('es false si cambian las horas trabajadas', () => {
    expect(sameRowValues(BASE, { ...BASE, horasTrabajadas: 96 })).toBe(false)
  })

  it('es false si cambia el salario por hora', () => {
    expect(sameRowValues(BASE, { ...BASE, salarioPorHora: 3000 })).toBe(false)
  })

  it('trata un código ausente en un lado como cero', () => {
    const a = { horasTrabajadas: 88, salarioPorHora: 2500, montos: { BASE: 180000 } }
    const b = { horasTrabajadas: 88, salarioPorHora: 2500, montos: { BASE: 180000, COMISION: 0 } }
    expect(sameRowValues(a, b)).toBe(true)
  })
})
