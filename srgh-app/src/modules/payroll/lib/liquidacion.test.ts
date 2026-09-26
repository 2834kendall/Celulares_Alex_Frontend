import { describe, expect, it } from 'vitest'
import {
  DIAS_CESANTIA_POR_ANIO,
  aniosReconocidosCesantia,
  anioCicloAguinaldo,
  calcularAguinaldo,
  calcularAntiguedad,
  calcularDiasCesantia,
  calcularDiasPreaviso,
  calcularLiquidacion,
  calcularMesesAntiguedad,
  calcularSalarioDiario,
  diasSalarioPendiente,
} from './liquidacion'

describe('calcularAntiguedad', () => {
  it('cuenta meses completos, sin adelantar si no se cumple el día del mes', () => {
    // 15 ene 2022 → 15 jul 2025 = 42 meses justos
    expect(calcularMesesAntiguedad(new Date(2022, 0, 15), new Date(2025, 6, 15))).toBe(42)
    // un día antes del aniversario mensual: 41
    expect(calcularMesesAntiguedad(new Date(2022, 0, 15), new Date(2025, 6, 14))).toBe(41)
  })

  it('nunca da negativo (fecha de salida antes que la de ingreso)', () => {
    expect(calcularAntiguedad(new Date(2025, 0, 1), new Date(2024, 0, 1))).toEqual({
      meses: 0,
      diasSobrantes: 0,
    })
  })

  // "Fracción superior a seis meses" es estricto. Con meses enteros, seis
  // meses y veinte días se leía como seis justos y no redondeaba el año.
  it('devuelve los días sueltos después del último mes completo', () => {
    // 10 ene 2020 → 30 jul 2021: 18 meses y 20 días
    expect(calcularAntiguedad(new Date(2020, 0, 10), new Date(2021, 6, 30))).toEqual({
      meses: 18,
      diasSobrantes: 20,
    })
    expect(calcularAntiguedad(new Date(2020, 0, 10), new Date(2021, 6, 10))).toEqual({
      meses: 18,
      diasSobrantes: 0,
    })
  })
})

describe('aniosReconocidosCesantia', () => {
  it('años completos, más uno si la fracción pasa de seis meses', () => {
    expect(aniosReconocidosCesantia(48)).toBe(4) // 4 años justos
    expect(aniosReconocidosCesantia(53)).toBe(4) // 4 años 5 meses
    expect(aniosReconocidosCesantia(56)).toBe(5) // 4 años 8 meses
  })

  it('seis meses justos no redondean; seis meses y un día, sí', () => {
    expect(aniosReconocidosCesantia(54, 0)).toBe(4)
    expect(aniosReconocidosCesantia(54, 1)).toBe(5)
  })
})

describe('calcularDiasCesantia (Art. 29 CT)', () => {
  it('la tabla tiene las 13 filas de la ley, y baja después del año 9', () => {
    expect(DIAS_CESANTIA_POR_ANIO).toEqual([
      19.5, 20, 20.5, 21, 21.24, 21.5, 22, 22, 22, 21.5, 21, 20.5, 20,
    ])
  })

  it('menos de 3 meses: no genera cesantía', () => {
    expect(calcularDiasCesantia(0)).toBe(0)
    expect(calcularDiasCesantia(2)).toBe(0)
  })

  // Inciso a): "no menor de tres meses ni mayor de seis". Seis justos entra.
  it('de 3 a 6 meses inclusive: 7 días', () => {
    expect(calcularDiasCesantia(3)).toBe(7)
    expect(calcularDiasCesantia(5)).toBe(7)
    expect(calcularDiasCesantia(6, 0)).toBe(7)
  })

  // Inciso b): "mayor de seis meses pero menor de un año".
  it('de más de 6 meses a menos de 1 año: 14 días', () => {
    expect(calcularDiasCesantia(6, 1)).toBe(14)
    expect(calcularDiasCesantia(7)).toBe(14)
    expect(calcularDiasCesantia(11)).toBe(14)
  })

  it('1 año: 19,5 días', () => {
    expect(calcularDiasCesantia(12)).toBe(19.5)
  })

  // La lectura del Ministerio de Trabajo: la fila de la antigüedad total se
  // multiplica por los años reconocidos. NO se suman las filas una a una
  // (eso daba 60 para 3 años; la fila del año 3 por 3 años da 61,5).
  it('3 años: fila del año 3 por 3 años = 61,5 días', () => {
    expect(calcularDiasCesantia(36)).toBe(61.5)
  })

  it('3 años y 7 meses: la fracción pasa de seis meses → 4 años × 21 = 84', () => {
    expect(calcularDiasCesantia(43)).toBe(84)
  })

  it('3 años y 4 meses: la fracción no llega → 3 años × 20,5 = 61,5', () => {
    expect(calcularDiasCesantia(40)).toBe(61.5)
  })

  // Ejemplo publicado por un despacho laboral: 4 años y 8 meses → 5 años.
  it('4 años y 8 meses: 5 años reconocidos', () => {
    expect(calcularDiasCesantia(56)).toBe(round(21.24 * 5))
  })

  it('8 años: 22 × 8 = 176 días, el máximo que da la tabla', () => {
    expect(calcularDiasCesantia(96)).toBe(176)
  })

  // Ejemplo publicado (El Financiero, abogada laboralista): 10 años de
  // antigüedad → 21,5 días por año, tope de 8 años → 172 días.
  it('10 años: fila del año 10 (21,5) por el tope de 8 años = 172 días', () => {
    expect(calcularDiasCesantia(120)).toBe(172)
  })

  // La tabla baja después del año 9: es como la escribió la Ley 7983, no un
  // error. Con el tope de 8, 15 años cobran menos días que 9.
  it('13 años o más: 20 × 8 = 160 días, y ya no cambia', () => {
    expect(calcularDiasCesantia(156)).toBe(160)
    expect(calcularDiasCesantia(300)).toBe(160)
    expect(calcularDiasCesantia(108)).toBe(176) // 9 años: 22 × 8
  })
})

describe('calcularDiasPreaviso (Art. 28 CT)', () => {
  it('menos de 3 meses: no aplica', () => {
    expect(calcularDiasPreaviso(2)).toBe(0)
  })

  it('de 3 a 6 meses inclusive: una semana', () => {
    expect(calcularDiasPreaviso(3)).toBe(7)
    expect(calcularDiasPreaviso(6, 0)).toBe(7)
  })

  it('de más de 6 meses a menos de 1 año: 15 días', () => {
    expect(calcularDiasPreaviso(6, 1)).toBe(15)
    expect(calcularDiasPreaviso(11)).toBe(15)
  })

  it('desde 1 año: un mes, sin importar cuántos años', () => {
    expect(calcularDiasPreaviso(12)).toBe(30)
    expect(calcularDiasPreaviso(240)).toBe(30)
  })
})

describe('calcularSalarioDiario (Art. 30 CT)', () => {
  // El bug que había: seis quincenas (tres meses) divididas entre 30 como si
  // cada una fuera un mes → la mitad del salario diario, la mitad de la
  // cesantía y del preaviso.
  it('promedia las quincenas pagadas como meses (dos por mes) y divide entre 30', () => {
    const doceQuincenas = Array(12).fill(350000) // ₡700.000 al mes, seis meses
    const r = calcularSalarioDiario(doceQuincenas, 999999)
    expect(r.origen).toBe('promedio')
    expect(r.salarioDiario).toBeCloseTo(23333.33, 2)
  })

  it('con quincenas distintas promedia lo que de verdad se pagó', () => {
    // 4 quincenas: 300k, 300k, 200k, 200k → ₡1.000.000 en 2 meses → 500k/mes
    expect(calcularSalarioDiario([300000, 300000, 200000, 200000], 0).salarioDiario).toBeCloseTo(
      500000 / 30,
      6
    )
  })

  it('con un número impar de quincenas sigue contando medio mes por quincena', () => {
    // 3 quincenas de 300k = 900k en 1,5 meses → 600k/mes → 20.000 diario
    expect(calcularSalarioDiario([300000, 300000, 300000], 0).salarioDiario).toBe(20000)
  })

  // Una sola quincena, encima parcial, daría un salario diario de fantasía.
  it('con menos de dos quincenas pagadas cae al contrato y lo dice', () => {
    const r = calcularSalarioDiario([22031.25], 470000)
    expect(r.origen).toBe('contrato')
    expect(r.salarioDiario).toBeCloseTo(470000 / 30, 6)
    expect(calcularSalarioDiario([], 300000)).toEqual({ salarioDiario: 10000, origen: 'contrato' })
  })

  it('ignora quincenas en cero o inválidas', () => {
    expect(calcularSalarioDiario([300000, 0, NaN, 300000], 0).salarioDiario).toBe(20000)
  })
})

describe('diasSalarioPendiente', () => {
  // Sale el 20 y la primera quincena ya se pagó: se deben del 16 al 20.
  // Antes se pagaba del 1 al 20, la primera quincena dos veces.
  it('descuenta la primera quincena si ya se pagó por planilla', () => {
    expect(
      diasSalarioPendiente({
        diaSalida: 20,
        primeraQuincenaPagada: true,
        quincenaDeSalidaPagada: false,
      })
    ).toBe(5)
  })

  it('si la primera quincena no se pagó, se debe el mes desde el 1', () => {
    expect(
      diasSalarioPendiente({
        diaSalida: 20,
        primeraQuincenaPagada: false,
        quincenaDeSalidaPagada: false,
      })
    ).toBe(20)
  })

  it('salida en la primera quincena: los días desde el 1', () => {
    expect(
      diasSalarioPendiente({
        diaSalida: 10,
        primeraQuincenaPagada: false,
        quincenaDeSalidaPagada: false,
      })
    ).toBe(10)
  })

  it('si la quincena de salida ya se pagó, no hay salario pendiente', () => {
    expect(
      diasSalarioPendiente({
        diaSalida: 20,
        primeraQuincenaPagada: true,
        quincenaDeSalidaPagada: true,
      })
    ).toBe(0)
  })

  it('el mes comercial tiene 30 días: el 31 cuenta como 30', () => {
    expect(
      diasSalarioPendiente({
        diaSalida: 31,
        primeraQuincenaPagada: true,
        quincenaDeSalidaPagada: false,
      })
    ).toBe(15)
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
  const BASE = {
    salarioDiario: 20000,
    diasTrabajadosMesActual: 5,
    sumaSalariosBrutosCicloAguinaldo: 1200000,
    diasVacacionesPendientes: 10,
    mesesAntiguedad: 43, // 3 años 7 meses → 4 años reconocidos
    porcentajeDeduccionObrera: 10.83,
  }

  it('renuncia voluntaria: solo proporcionales, sin preaviso ni cesantía', () => {
    const r = calcularLiquidacion({ ...BASE, generaCesantia: false, generaPreaviso: false })

    expect(r.salarioProporcional).toBe(100000) // 20000 × 5
    // El salario pendiente también es salario del ciclo: entra al aguinaldo.
    expect(r.aguinaldoProporcional).toBe(round((1200000 + 100000) / 12))
    expect(r.vacacionesPagadas).toBe(200000) // 20000 × 10
    expect(r.diasPreaviso).toBe(0)
    expect(r.preaviso).toBe(0)
    expect(r.diasCesantia).toBe(0)
    expect(r.cesantia).toBe(0)
    expect(r.total).toBe(round(100000 + 108333.33 + 200000))
  })

  it('despido sin justa causa: preaviso de un mes y cesantía de 4 años × 21', () => {
    const r = calcularLiquidacion({ ...BASE, generaCesantia: true, generaPreaviso: true })

    expect(r.diasPreaviso).toBe(30)
    expect(r.preaviso).toBe(600000)
    expect(r.diasCesantia).toBe(84)
    expect(r.cesantia).toBe(1680000)
    expect(r.total).toBe(round(100000 + 108333.33 + 200000 + 600000 + 1680000))
  })

  // Solo cotiza lo que es salario. Cobrarle CCSS a la cesantía o al preaviso
  // sería descontarle a la persona una indemnización que no cotiza; y no
  // cobrársela al salario pendiente ni a las vacaciones dejaría a la empresa
  // sin reportar salario a la Caja.
  it('la cuota obrera se aplica solo al salario pendiente y a las vacaciones', () => {
    const r = calcularLiquidacion({ ...BASE, generaCesantia: true, generaPreaviso: true })

    expect(r.deduccionesObreras).toBe(round((100000 + 200000) * 0.1083)) // 32490
    expect(r.neto).toBe(round(r.total - 32490))
  })

  it('sin porcentaje de deducción no descuenta nada', () => {
    const r = calcularLiquidacion({
      ...BASE,
      porcentajeDeduccionObrera: undefined,
      generaCesantia: false,
      generaPreaviso: false,
    })

    expect(r.deduccionesObreras).toBe(0)
    expect(r.neto).toBe(r.total)
  })

  // Seis meses y un día de antigüedad: ya no son "de 3 a 6 meses".
  it('usa los días sueltos para decidir el tramo de antigüedad', () => {
    const justo = calcularLiquidacion({
      ...BASE,
      mesesAntiguedad: 6,
      diasSobrantesAntiguedad: 0,
      generaCesantia: true,
      generaPreaviso: true,
    })
    const unDiaMas = calcularLiquidacion({
      ...BASE,
      mesesAntiguedad: 6,
      diasSobrantesAntiguedad: 1,
      generaCesantia: true,
      generaPreaviso: true,
    })

    expect(justo.diasCesantia).toBe(7)
    expect(justo.diasPreaviso).toBe(7)
    expect(unDiaMas.diasCesantia).toBe(14)
    expect(unDiaMas.diasPreaviso).toBe(15)
  })

  it('lineas trae los 5 rubros en orden, con días donde aplica', () => {
    const r = calcularLiquidacion({ ...BASE, generaCesantia: true, generaPreaviso: true })

    expect(r.lineas.map((l) => l.concepto)).toEqual([
      'Salario pendiente',
      'Aguinaldo proporcional',
      'Vacaciones no disfrutadas',
      'Preaviso',
      'Cesantía',
    ])
    expect(r.lineas[0].dias).toBe(5)
    expect(r.lineas[1].dias).toBeNull()
  })

  // Caso completo con números de una fuente publicada: 10 años, ₡700.000 al
  // mes, despido sin justa causa. La cesantía tiene que dar ₡4.013.333,33.
  it('reproduce el ejemplo publicado de 10 años a ₡700.000', () => {
    const { salarioDiario } = calcularSalarioDiario(Array(12).fill(350000), 0)
    const r = calcularLiquidacion({
      salarioDiario,
      diasTrabajadosMesActual: 0,
      sumaSalariosBrutosCicloAguinaldo: 0,
      diasVacacionesPendientes: 0,
      mesesAntiguedad: 120,
      generaCesantia: true,
      generaPreaviso: true,
    })

    expect(salarioDiario).toBeCloseTo(23333.33, 2)
    expect(r.diasCesantia).toBe(172)
    expect(r.cesantia).toBe(4013333.33)
    expect(r.preaviso).toBe(700000)
  })
})

function round(n: number): number {
  return Math.round(n * 100) / 100
}
