import { describe, expect, it } from 'vitest'
import {
  anioCicloAguinaldo,
  calcularAguinaldo,
  calcularDiasCesantia,
  calcularDiasPreaviso,
  calcularLiquidacion,
  calcularMesesAntiguedad,
} from './liquidacion'

describe('calcularMesesAntiguedad', () => {
  it('cuenta meses completos, sin adelantar si no se cumple el día del mes', () => {
    // 3 años y 6 meses exactos
    expect(calcularMesesAntiguedad(new Date(2022, 0, 15), new Date(2025, 6, 15))).toBe(42)
    // un día antes del aniversario mensual: no cuenta ese mes
    expect(calcularMesesAntiguedad(new Date(2022, 0, 15), new Date(2025, 6, 14))).toBe(41)
  })

  it('nunca da negativo (fecha de salida antes que la de ingreso)', () => {
    expect(calcularMesesAntiguedad(new Date(2025, 0, 1), new Date(2024, 0, 1))).toBe(0)
  })
})

describe('calcularDiasCesantia', () => {
  it('menos de 3 meses: no genera cesantía', () => {
    expect(calcularDiasCesantia(0)).toBe(0)
    expect(calcularDiasCesantia(2)).toBe(0)
  })

  it('de 3 a 6 meses: 7 días fijos', () => {
    expect(calcularDiasCesantia(3)).toBe(7)
    expect(calcularDiasCesantia(5)).toBe(7)
  })

  it('de 6 meses a 1 año: 14 días fijos', () => {
    expect(calcularDiasCesantia(6)).toBe(14)
    expect(calcularDiasCesantia(11)).toBe(14)
  })

  it('1 año exacto: 19.5 días (solo año 1)', () => {
    expect(calcularDiasCesantia(12)).toBe(19.5)
  })

  it('3 años exactos: suma años 1+2+3 = 60 días', () => {
    expect(calcularDiasCesantia(36)).toBe(60)
  })

  it('3 años y 7 meses: fracción > 6 meses redondea al año 4 completo (81 días)', () => {
    expect(calcularDiasCesantia(43)).toBe(81)
  })

  it('3 años y 4 meses: fracción <= 6 meses NO redondea (se queda en 60 días)', () => {
    expect(calcularDiasCesantia(40)).toBe(60)
  })

  it('3 años y 6 meses exactos: no redondea (regla es "superior a seis meses")', () => {
    expect(calcularDiasCesantia(42)).toBe(60)
  })

  it('8 años exactos: tope de 167.74 días', () => {
    expect(calcularDiasCesantia(96)).toBeCloseTo(167.74)
  })

  it('15 años: se topa en 8 años (167.74 días), no sigue acumulando', () => {
    expect(calcularDiasCesantia(180)).toBeCloseTo(167.74)
    expect(calcularDiasCesantia(96)).toBe(calcularDiasCesantia(180))
  })
})

describe('calcularDiasPreaviso', () => {
  it('menos de 3 meses: no aplica', () => {
    expect(calcularDiasPreaviso(2)).toBe(0)
  })

  it('de 3 a 6 meses: 7 días', () => {
    expect(calcularDiasPreaviso(3)).toBe(7)
    expect(calcularDiasPreaviso(5)).toBe(7)
  })

  it('de 6 meses a 1 año: 15 días', () => {
    expect(calcularDiasPreaviso(6)).toBe(15)
    expect(calcularDiasPreaviso(11)).toBe(15)
  })

  it('1 año o más: 30 días, sin importar cuántos años (no sigue subiendo)', () => {
    expect(calcularDiasPreaviso(12)).toBe(30)
    expect(calcularDiasPreaviso(240)).toBe(30)
  })
})

describe('calcularAguinaldo', () => {
  it('divide la suma de salarios brutos del ciclo entre 12', () => {
    expect(calcularAguinaldo(1200000)).toBe(100000)
  })
})

describe('anioCicloAguinaldo', () => {
  it('enero a noviembre pertenecen al ciclo del mismo año', () => {
    expect(anioCicloAguinaldo(1, 2026)).toBe(2026)
    expect(anioCicloAguinaldo(11, 2026)).toBe(2026)
  })

  it('diciembre abre el ciclo del año siguiente', () => {
    expect(anioCicloAguinaldo(12, 2026)).toBe(2027)
  })
})

describe('calcularLiquidacion', () => {
  it('renuncia voluntaria: solo proporcionales, sin preaviso ni cesantía', () => {
    const resultado = calcularLiquidacion({
      salarioDiario: 20000,
      diasTrabajadosMesActual: 15,
      sumaSalariosBrutosCicloAguinaldo: 1200000,
      diasVacacionesPendientes: 10,
      mesesAntiguedad: 43, // 3 años 7 meses -> año 4 completo si aplicara cesantía
      generaCesantia: false,
      generaPreaviso: false,
    })

    expect(resultado.salarioProporcional).toBe(300000) // 20000 * 15
    expect(resultado.aguinaldoProporcional).toBe(100000) // 1200000 / 12
    expect(resultado.vacacionesPagadas).toBe(200000) // 20000 * 10
    expect(resultado.diasPreaviso).toBe(0)
    expect(resultado.preaviso).toBe(0)
    expect(resultado.diasCesantia).toBe(0)
    expect(resultado.cesantia).toBe(0)
    expect(resultado.total).toBe(600000)
  })

  it('despido sin justa causa: incluye preaviso y cesantía completos', () => {
    const resultado = calcularLiquidacion({
      salarioDiario: 20000,
      diasTrabajadosMesActual: 15,
      sumaSalariosBrutosCicloAguinaldo: 1200000,
      diasVacacionesPendientes: 10,
      mesesAntiguedad: 43, // 3a7m -> redondea a 4 años -> 81 días cesantía
      generaCesantia: true,
      generaPreaviso: true,
    })

    expect(resultado.diasPreaviso).toBe(30)
    expect(resultado.preaviso).toBe(600000) // 20000 * 30
    expect(resultado.diasCesantia).toBe(81)
    expect(resultado.cesantia).toBe(1620000) // 20000 * 81
    expect(resultado.total).toBe(300000 + 100000 + 200000 + 600000 + 1620000)
  })

  it('despido con justa causa: igual que renuncia, sin preaviso ni cesantía', () => {
    const resultado = calcularLiquidacion({
      salarioDiario: 20000,
      diasTrabajadosMesActual: 8,
      sumaSalariosBrutosCicloAguinaldo: 600000,
      diasVacacionesPendientes: 0,
      mesesAntiguedad: 100,
      generaCesantia: false,
      generaPreaviso: false,
    })

    expect(resultado.preaviso).toBe(0)
    expect(resultado.cesantia).toBe(0)
    expect(resultado.total).toBe(resultado.salarioProporcional + resultado.aguinaldoProporcional)
  })

  it('lineas trae los 5 rubros en orden, con días donde aplica', () => {
    const resultado = calcularLiquidacion({
      salarioDiario: 10000,
      diasTrabajadosMesActual: 5,
      sumaSalariosBrutosCicloAguinaldo: 240000,
      diasVacacionesPendientes: 3,
      mesesAntiguedad: 12,
      generaCesantia: true,
      generaPreaviso: true,
    })

    expect(resultado.lineas.map((l) => l.concepto)).toEqual([
      'Salario proporcional',
      'Aguinaldo proporcional',
      'Vacaciones no disfrutadas',
      'Preaviso',
      'Cesantía',
    ])
    expect(resultado.lineas[1].dias).toBeNull()
  })
})
