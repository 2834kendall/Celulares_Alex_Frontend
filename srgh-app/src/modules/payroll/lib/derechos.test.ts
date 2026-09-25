import { describe, expect, it } from 'vitest'
import {
  aguinaldoDelCiclo,
  claveDeFecha,
  claveQuincenal,
  completarQuincenasDeLicencia,
  computarQuincenas,
  contratosDeLaRelacion,
  cumpleMesMinimoAguinaldo,
  diaSiguiente,
  diasEnComun,
  diasHabilesEnComun,
  inicioDeLaRelacion,
  promedioDiarioSinSubsidios,
  proponerVacaciones,
  type AusenciaSubsidio,
  type ContratoDelEmpleado,
  type QuincenaSalario,
} from './derechos'
import { rangoQuincena } from './fechas'

/** Salario real de ₡430.000: la quincena completa vale ₡215.000. */
const SALARIO = 430000

function q(anio: number, mes: number, quincena: 1 | 2, bruto = SALARIO / 2, pagado = true) {
  const rango = rangoQuincena(mes, anio, quincena)!
  return {
    clave: claveQuincenal(anio, mes, quincena),
    etiqueta: `${anio}-${mes}-Q${quincena}`,
    fechaInicio: rango.inicio,
    fechaFin: rango.fin,
    bruto,
    pagado,
    salarioMensualContrato: SALARIO,
  } satisfies QuincenaSalario
}

/** Las 24 quincenas del ciclo `anio`: dic del año anterior a nov. */
function ciclo(anio: number, bruto = SALARIO / 2): QuincenaSalario[] {
  const filas: QuincenaSalario[] = [q(anio - 1, 12, 1, bruto), q(anio - 1, 12, 2, bruto)]
  for (let mes = 1; mes <= 11; mes++) filas.push(q(anio, mes, 1, bruto), q(anio, mes, 2, bruto))
  return filas
}

const MATERNIDAD = (inicio: string, fin: string): AusenciaSubsidio => ({
  fechaInicio: inicio,
  fechaFin: fin,
  esMaternidad: true,
})
const ENFERMEDAD = (inicio: string, fin: string): AusenciaSubsidio => ({
  fechaInicio: inicio,
  fechaFin: fin,
  esMaternidad: false,
})

describe('fechas', () => {
  it('diaSiguiente cruza mes y año', () => {
    expect(diaSiguiente('2026-11-30')).toBe('2026-12-01')
    expect(diaSiguiente('2026-12-31')).toBe('2027-01-01')
    expect(diaSiguiente('2028-02-28')).toBe('2028-02-29')
  })

  it('diasEnComun cuenta ambos extremos y da 0 si no se tocan', () => {
    expect(diasEnComun('2026-08-01', '2026-08-15', '2026-08-10', '2026-08-31')).toBe(6)
    expect(diasEnComun('2026-08-01', '2026-08-15', '2026-08-16', '2026-08-31')).toBe(0)
  })

  it('diasHabilesEnComun no cuenta domingos (igual que Ausencias)', () => {
    // Lunes 3 al domingo 9 de agosto de 2026: 6 hábiles.
    expect(diasHabilesEnComun('2026-08-03', '2026-08-09', '2026-01-01', '2026-12-31')).toBe(6)
  })

  it('claveDeFecha parte la quincena en el 15', () => {
    expect(claveDeFecha('2026-08-15')).toBe(claveQuincenal(2026, 8, 1))
    expect(claveDeFecha('2026-08-16')).toBe(claveQuincenal(2026, 8, 2))
  })
})

describe('cumpleMesMinimoAguinaldo (MTSS: un mes continuo)', () => {
  it('quien entró el 1 de noviembre llega al 30 con un mes: SÍ', () => {
    expect(cumpleMesMinimoAguinaldo('2026-11-01', '2026-11-30')).toBe(true)
  })

  it('quien entró el 2 de noviembre no llega: NO', () => {
    expect(cumpleMesMinimoAguinaldo('2026-11-02', '2026-11-30')).toBe(false)
  })

  it('con años de antigüedad, SÍ; ingreso posterior al corte, NO', () => {
    expect(cumpleMesMinimoAguinaldo('2019-03-10', '2026-11-30')).toBe(true)
    expect(cumpleMesMinimoAguinaldo('2026-12-05', '2026-11-30')).toBe(false)
  })

  it('en una salida: del 10 de marzo al 9 de abril es un mes; al 8 no', () => {
    expect(cumpleMesMinimoAguinaldo('2026-03-10', '2026-04-09')).toBe(true)
    expect(cumpleMesMinimoAguinaldo('2026-03-10', '2026-04-08')).toBe(false)
  })
})

describe('computarQuincenas', () => {
  it('una quincena entera de maternidad (bruto 0) cuenta como la quincena completa', () => {
    const [r] = computarQuincenas([q(2026, 3, 1, 0)], [MATERNIDAD('2026-02-20', '2026-06-20')])

    expect(r.diasMaternidad).toBe(15)
    expect(r.montoMaternidad).toBe(215000)
    expect(r.salarioComputable).toBe(215000)
  })

  it('maternidad parcial: completa la parte que la licencia cubrió', () => {
    // 10 de 15 días trabajados → bruto 143.333,33; 5 días de licencia.
    const [r] = computarQuincenas(
      [q(2026, 3, 1, 143333.33)],
      [MATERNIDAD('2026-03-11', '2026-07-10')]
    )

    expect(r.diasMaternidad).toBe(5)
    expect(r.salarioComputable).toBeCloseTo(215000, 1)
  })

  it('si el base ya pagó esos días, no los cuenta dos veces', () => {
    const [r] = computarQuincenas([q(2026, 3, 1, 215000)], [MATERNIDAD('2026-03-01', '2026-03-15')])

    expect(r.montoMaternidad).toBe(0)
    expect(r.salarioComputable).toBe(215000)
  })

  it('una incapacidad por enfermedad NO suma nada: el subsidio no es salario', () => {
    const [r] = computarQuincenas([q(2026, 3, 1, 100000)], [ENFERMEDAD('2026-03-05', '2026-03-12')])

    expect(r.diasSubsidio).toBe(8)
    expect(r.montoMaternidad).toBe(0)
    expect(r.salarioComputable).toBe(100000)
  })

  it('una Q2 de 16 días entera de maternidad vale la quincena completa, no 16/30', () => {
    const [r] = computarQuincenas([q(2026, 8, 2, 0)], [MATERNIDAD('2026-08-01', '2026-12-01')])

    expect(r.diasQuincena).toBe(16)
    expect(r.salarioComputable).toBe(215000)
  })
})

describe('aguinaldoDelCiclo', () => {
  it('un ciclo completo con salario de ₡430.000 da ₡430.000', () => {
    const a = aguinaldoDelCiclo({
      quincenas: computarQuincenas(ciclo(2026), []),
      anio: 2026,
      inicioRelacion: '2020-01-15',
    })

    expect(a.sumaSalarios).toBe(5160000)
    expect(a.monto).toBe(430000)
    expect(a.elegible).toBe(true)
  })

  it('cuatro meses de licencia de maternidad no le bajan el aguinaldo', () => {
    // Marzo a junio en licencia: la planilla pagó ₡0 esas 8 quincenas.
    const quincenas = ciclo(2026).map((x) =>
      x.fechaInicio >= '2026-03-01' && x.fechaFin <= '2026-06-30' ? { ...x, bruto: 0 } : x
    )
    const a = aguinaldoDelCiclo({
      quincenas: computarQuincenas(quincenas, [MATERNIDAD('2026-03-01', '2026-06-30')]),
      anio: 2026,
      inicioRelacion: '2020-01-15',
    })

    expect(a.monto).toBe(430000)
    expect(a.maternidad).toBe(1720000)
  })

  it('una incapacidad por enfermedad sí baja el aguinaldo: solo cuenta lo pagado como salario', () => {
    // Un mes (2 quincenas) incapacitado: la planilla pagó ₡0.
    const quincenas = ciclo(2026).map((x) =>
      x.fechaInicio >= '2026-05-01' && x.fechaFin <= '2026-05-31' ? { ...x, bruto: 0 } : x
    )
    const a = aguinaldoDelCiclo({
      quincenas: computarQuincenas(quincenas, [ENFERMEDAD('2026-05-01', '2026-05-31')]),
      anio: 2026,
      inicioRelacion: '2020-01-15',
    })

    // 22 quincenas × 215.000 ÷ 12
    expect(a.monto).toBe(394166.67)
  })

  it('las quincenas de diciembre son del ciclo siguiente y las no pagadas se reportan', () => {
    const quincenas = [
      ...ciclo(2026),
      q(2026, 12, 1), // ciclo 2027
    ]
    quincenas[23] = { ...quincenas[23], pagado: false } // nov Q2 sin pagar
    const a = aguinaldoDelCiclo({
      quincenas: computarQuincenas(quincenas, []),
      anio: 2026,
      inicioRelacion: '2020-01-15',
    })

    expect(a.sinPagar).toEqual(['2026-11-Q2'])
    expect(a.sumaSalarios).toBe(23 * 215000)
  })

  it('sin el mes continuo al 30 de noviembre, no hay aguinaldo', () => {
    const a = aguinaldoDelCiclo({
      quincenas: computarQuincenas([q(2026, 11, 2)], []),
      anio: 2026,
      inicioRelacion: '2026-11-16',
    })

    expect(a.elegible).toBe(false)
    expect(a.monto).toBe(0)
  })
})

describe('promedioDiarioSinSubsidios (Art. 30 CT, MTSS DAJ-AE-142-11)', () => {
  it('salta la quincena con incapacidad y toma la anterior para completar seis meses', () => {
    // 13 quincenas de ₡150.000; la más reciente con incapacidad y ₡50.000.
    const filas = [
      ...Array.from({ length: 12 }, (_, i) => ({
        ...q(2025, 1 + Math.floor(i / 2), ((i % 2) + 1) as 1 | 2, 150000),
      })),
      q(2025, 7, 1, 50000),
    ]
    const r = promedioDiarioSinSubsidios(
      computarQuincenas(filas, [ENFERMEDAD('2025-07-03', '2025-07-10')]),
      claveQuincenal(2025, 7, 1),
      12,
      300000
    )

    expect(r.excluidas).toEqual(['2025-7-Q1'])
    expect(r.usadas).toHaveLength(12)
    // 12 × 150.000 ÷ 6 meses ÷ 30 = 10.000
    expect(r.salarioDiario).toBeCloseTo(10000, 6)
    expect(r.origen).toBe('promedio')
  })

  it('una quincena de maternidad cuenta con el salario completo', () => {
    const filas = [q(2025, 6, 1), q(2025, 6, 2, 0)]
    const r = promedioDiarioSinSubsidios(
      computarQuincenas(filas, [MATERNIDAD('2025-06-16', '2025-10-15')]),
      claveQuincenal(2025, 6, 2),
      12,
      SALARIO
    )

    expect(r.excluidas).toEqual([])
    expect(r.salarioDiario).toBeCloseTo(SALARIO / 30, 6)
  })
})

describe('proponerVacaciones', () => {
  it('un día por mes laborado, menos los días tomados en Ausencias', () => {
    const v = proponerVacaciones({
      ingreso: '2025-01-01',
      ultimoDia: '2025-12-31',
      diasIncapacidad: 0,
      diasTomados: 5,
    })

    expect(v.diasGanados).toBe(12)
    expect(v.diasPendientes).toBe(7)
  })

  it('los meses de incapacidad no ganan vacaciones', () => {
    const v = proponerVacaciones({
      ingreso: '2025-01-01',
      ultimoDia: '2025-12-31',
      diasIncapacidad: 45,
      diasTomados: 0,
    })

    expect(v.mesesEfectivos).toBe(11)
    expect(v.diasPendientes).toBe(11)
  })

  it('nunca propone negativo', () => {
    const v = proponerVacaciones({
      ingreso: '2025-01-01',
      ultimoDia: '2025-03-31',
      diasIncapacidad: 0,
      diasTomados: 10,
    })

    expect(v.diasPendientes).toBe(0)
  })
})

describe('contratosDeLaRelacion', () => {
  const c = (
    labId: number,
    fechaInicio: string,
    fechaFin: string | null,
    liquidado = false
  ): ContratoDelEmpleado => ({ labId, fechaInicio, fechaFin, salarioMensual: SALARIO, liquidado })

  it('un traslado de sucursal: los dos contratos son la misma relación', () => {
    const contratos = [c(1, '2022-01-10', '2026-03-31'), c(2, '2026-04-01', null)]

    expect(contratosDeLaRelacion(2, contratos).map((x) => x.labId)).toEqual([1, 2])
    expect(inicioDeLaRelacion(null, 2, contratos)).toBe('2022-01-10')
  })

  it('salió con liquidación y volvió: la relación nueva no arrastra la vieja', () => {
    const contratos = [c(1, '2020-01-10', '2023-06-30', true), c(2, '2024-02-01', null)]

    expect(contratosDeLaRelacion(2, contratos).map((x) => x.labId)).toEqual([2])
    // La ficha guarda el ingreso de 2020, pero esa relación terminó.
    expect(inicioDeLaRelacion('2020-01-10', 2, contratos)).toBe('2024-02-01')
  })

  it('con ingreso original y sin liquidaciones, manda la ficha', () => {
    expect(inicioDeLaRelacion('2015-05-05', 1, [c(1, '2021-01-01', null)])).toBe('2015-05-05')
  })
})

describe('completarQuincenasDeLicencia', () => {
  const contratos: ContratoDelEmpleado[] = [
    {
      labId: 1,
      fechaInicio: '2020-01-01',
      fechaFin: null,
      salarioMensual: SALARIO,
      liquidado: false,
    },
  ]

  it('si no le armaron la fila durante la licencia, la quincena igual cuenta como salario', () => {
    // Solo hay fila de marzo Q1; la licencia cubre marzo completo.
    const conFilas = completarQuincenasDeLicencia(
      [q(2026, 3, 1, 0)],
      [MATERNIDAD('2026-03-01', '2026-03-31')],
      contratos
    )
    const r = computarQuincenas(conFilas, [MATERNIDAD('2026-03-01', '2026-03-31')])

    expect(r).toHaveLength(2)
    expect(r[1]).toMatchObject({
      clave: claveQuincenal(2026, 3, 2),
      bruto: 0,
      salarioComputable: 215000,
    })
    expect(r[1].etiqueta).toContain('sin planilla')
  })

  it('no duplica quincenas que sí tienen fila, ni agrega por una incapacidad común', () => {
    const r = completarQuincenasDeLicencia(
      [q(2026, 3, 1, 0), q(2026, 3, 2, 0)],
      [MATERNIDAD('2026-03-01', '2026-03-31'), ENFERMEDAD('2026-04-01', '2026-04-30')],
      contratos
    )

    expect(r).toHaveLength(2)
  })
})
