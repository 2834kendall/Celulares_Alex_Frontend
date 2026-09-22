import { describe, expect, it } from 'vitest'
import {
  baseParaHorasEditadas,
  diasDeLaQuincena,
  evaluarBaseGuardado,
  prellenarDesdeAsistencia,
  type HorasDeAsistencia,
} from './prellenadoAsistencia'

/** El ejemplo del negocio: base ₡400.000, real ₡430.000, jornada diurna de 48 h. */
const CONTRATO = { salarioBaseMensual: 400000, salarioRealMensual: 430000, horasSemanales: 48 }

const Q1_AGOSTO = { anio: 2026, mes: 8, quincena: 1 }
/** Agosto tiene 31 días: la Q2 son 16. */
const Q2_AGOSTO = { anio: 2026, mes: 8, quincena: 2 }
/** Febrero 2026 tiene 28 días: la Q2 son 13. */
const Q2_FEBRERO = { anio: 2026, mes: 2, quincena: 2 }

/** Lectura con `ordinarias` trabajadas de `programadas` en horario, sin ausencias. */
function lectura(
  ordinarias: number,
  programadas: number,
  over: Partial<HorasDeAsistencia> = {}
): HorasDeAsistencia {
  return {
    horasEsperadas: programadas,
    horasOrdinarias: ordinarias,
    horasExtra: 0,
    horasAcreditadas: 0,
    diasAcreditadosSinHorario: 0,
    periodoCubiertoPorAusencias: false,
    horasProgramadasTotales: programadas,
    diasJustificadosSinHorario: 0,
    diasSinProgramar: 0,
    ...over,
  }
}

describe('diasDeLaQuincena', () => {
  it('Q1 son siempre 15 días; Q2 los que quedan del mes', () => {
    expect(diasDeLaQuincena(Q1_AGOSTO)).toBe(15)
    expect(diasDeLaQuincena(Q2_AGOSTO)).toBe(16)
    expect(diasDeLaQuincena({ anio: 2026, mes: 9, quincena: 2 })).toBe(15)
    expect(diasDeLaQuincena(Q2_FEBRERO)).toBe(13)
    expect(diasDeLaQuincena({ anio: 2028, mes: 2, quincena: 2 })).toBe(14) // bisiesto
  })
})

describe('prellenarDesdeAsistencia', () => {
  // El ejemplo que dio el negocio, número por número.
  it('Q2 de 16 días, 96 de 128 h: base 160.000 + ajuste 1.250 = 161.250', () => {
    const fila = prellenarDesdeAsistencia(CONTRATO, lectura(96, 128), Q2_AGOSTO)

    expect(fila.ratio).toBe(0.75)
    expect(fila.pagoTotal).toBe(161250)
    expect(fila.base).toBe(160000)
    expect(fila.ajuste).toBe(1250)
  })

  it('cumplir todo el horario cobra el objetivo: real ÷ 2', () => {
    const fila = prellenarDesdeAsistencia(CONTRATO, lectura(96, 96), Q1_AGOSTO)

    expect(fila.base).toBe(200000) // 400.000 ÷ 30 × 15
    expect(fila.ajuste).toBe(15000)
    expect(fila.pagoTotal).toBe(215000)
  })

  it('en una Q2 de 13 días la base es menor y el ajuste la completa', () => {
    const fila = prellenarDesdeAsistencia(CONTRATO, lectura(88, 88), Q2_FEBRERO)

    expect(fila.base).toBe(173333.33) // 400.000 ÷ 30 × 13
    expect(fila.ajuste).toBe(41666.67)
    expect(fila.base + fila.ajuste).toBe(215000)
  })

  // Con el real igual al base, en un mes de 31 días la base de la Q2 (16
  // días) pasa la mitad del salario: el ajuste es negativo y el mes cuadra.
  it('el ajuste puede ser negativo y el mes suma exactamente el salario real', () => {
    const igual = { ...CONTRATO, salarioRealMensual: 430000, salarioBaseMensual: 430000 }
    const q1 = prellenarDesdeAsistencia(igual, lectura(96, 96), Q1_AGOSTO)
    const q2 = prellenarDesdeAsistencia(igual, lectura(104, 104), Q2_AGOSTO)

    expect(q2.base).toBe(229333.33)
    expect(q2.ajuste).toBe(-14333.33)
    expect(q1.pagoTotal + q2.pagoTotal).toBe(430000)
  })

  it('trabajar de más no sube el pago: el ratio se topa en 1 y lo extra va al banco', () => {
    const fila = prellenarDesdeAsistencia(CONTRATO, lectura(96, 96, { horasExtra: 6 }), Q1_AGOSTO)

    expect(fila.ratio).toBe(1)
    expect(fila.pagoTotal).toBe(215000)
    expect(fila.horasExtra).toBe(6)
  })

  it('el valor hora sale del salario real ÷ 30 ÷ 8', () => {
    const fila = prellenarDesdeAsistencia(CONTRATO, lectura(96, 96), Q1_AGOSTO)

    expect(fila.salarioPorHora).toBe(1791.67) // 430.000 / 30 / 8
  })

  it('sin salario real en el contrato se paga el base, sin ajuste', () => {
    const fila = prellenarDesdeAsistencia(
      { ...CONTRATO, salarioRealMensual: 0 },
      lectura(96, 96),
      Q1_AGOSTO
    )

    expect(fila.pagoTotal).toBe(200000)
    expect(fila.ajuste).toBe(0)
  })

  // Regla del negocio: 0 si no hay horas programadas.
  it('sin horas programadas el ratio es 0 y la fila sale en ₡0', () => {
    const fila = prellenarDesdeAsistencia(CONTRATO, null, Q1_AGOSTO)

    expect(fila.ratio).toBe(0)
    expect(fila.base).toBe(0)
    expect(fila.ajuste).toBe(0)
    expect(fila.horas).toBe(0)
    expect(fila.desdeAsistencia).toBe(false)
  })

  it('sin salario no hay nada que pagar', () => {
    const fila = prellenarDesdeAsistencia(
      { salarioBaseMensual: 0, salarioRealMensual: 0, horasSemanales: 48 },
      lectura(96, 96),
      Q1_AGOSTO
    )

    expect(fila.pagoTotal).toBe(0)
    expect(fila.salarioPorHora).toBe(0)
  })

  describe('feriados y ausencias', () => {
    it('6 días trabajados y 6 de vacaciones programadas cobran el objetivo entero', () => {
      const fila = prellenarDesdeAsistencia(
        CONTRATO,
        lectura(48, 48, { horasAcreditadas: 48, horasProgramadasTotales: 96 }),
        Q1_AGOSTO
      )

      expect(fila.ratio).toBe(1)
      expect(fila.pagoTotal).toBe(215000)
      expect(fila.horasPagadasSinTrabajar).toBe(48)
    })

    it('un permiso sin goce sí rebaja: cuenta en lo programado y no en lo cumplido', () => {
      const fila = prellenarDesdeAsistencia(
        CONTRATO,
        lectura(48, 48, { horasProgramadasTotales: 96 }),
        Q1_AGOSTO
      )

      expect(fila.ratio).toBe(0.5)
      expect(fila.pagoTotal).toBe(107500)
    })

    it('un día de vacaciones sin horario pesa como un día de la jornada (8 h)', () => {
      const fila = prellenarDesdeAsistencia(
        CONTRATO,
        lectura(88, 88, { diasAcreditadosSinHorario: 1, diasJustificadosSinHorario: 1 }),
        Q1_AGOSTO
      )

      expect(fila.ratio).toBe(1)
      expect(fila.horasPagadasSinTrabajar).toBe(8)
    })

    it('una quincena entera de incapacidad no cobra salario (va por subsidio)', () => {
      const fila = prellenarDesdeAsistencia(
        CONTRATO,
        lectura(0, 0, { horasProgramadasTotales: 96, periodoCubiertoPorAusencias: true }),
        Q1_AGOSTO
      )

      expect(fila.pagoTotal).toBe(0)
      expect(fila.desdeAsistencia).toBe(true)
    })

    // Un día justificado entre días sin horario no es un horario: la lectura
    // no sirve y, por regla, sin horas programadas no hay pago.
    it('un día de vacaciones sin el resto del horario cargado no vuelve útil la lectura', () => {
      const fila = prellenarDesdeAsistencia(
        CONTRATO,
        lectura(0, 0, { diasAcreditadosSinHorario: 1, diasJustificadosSinHorario: 1 }),
        Q1_AGOSTO
      )

      expect(fila.desdeAsistencia).toBe(false)
      expect(fila.pagoTotal).toBe(0)
    })
  })

  // El bug real que reportó el negocio: a alguien se le carga horario para
  // UN solo día de la quincena (8 h), lo trabaja completo, y los otros 14
  // días no tienen ninguna fila de programación (no es que no le tocaba
  // trabajar: nadie le armó el horario). Antes de diasSinProgramar,
  // horasProgramadasTotales salía en 8 y "trabajó 8 de 8 programadas" pagaba
  // la quincena entera. Es el mismo síntoma que SGRH-83 ya había arreglado
  // una vez (commit 93b36ff) y que este cálculo había vuelto a abrir.
  describe('horario a medio cargar', () => {
    it('un solo día cargado y trabajado en una quincena de 15 días NO paga la quincena completa', () => {
      const fila = prellenarDesdeAsistencia(
        CONTRATO,
        lectura(8, 8, { diasSinProgramar: 14 }),
        Q1_AGOSTO
      )

      // 8 h cumplidas de 120 (8 del día cargado + 14 días × 8 h sin programar).
      expect(fila.ratio).toBeCloseTo(1 / 15, 6)
      expect(fila.ratio).not.toBe(1)
      expect(fila.pagoTotal).toBe(14333.33)
      expect(fila.base).toBe(13333.33)
      expect(fila.ajuste).toBe(1000)
      // Lo que pagaba el bug: el objetivo completo de la quincena.
      expect(fila.pagoTotal).not.toBe(215000)
      expect(fila.base).not.toBe(200000)
    })
  })
})

describe('evaluarBaseGuardado', () => {
  const guardadas = { horas: 96, horasExtra: 0 }

  // Fila armada con la regla anterior (salario base ÷ 2 contra 96 h, ajuste a
  // mano). Hoy le toca otro base y un ajuste automático.
  it('marca una fila de la regla anterior aunque las horas no cambien', () => {
    const r = evaluarBaseGuardado({
      baseGuardado: 200000,
      ajusteGuardado: 0,
      contrato: CONTRATO,
      guardadas,
      lectura: lectura(96, 96),
      quincena: Q2_AGOSTO,
    })

    expect(r).toEqual({ desactualizado: true, esperado: 213333.33, ajusteEsperado: 1666.67 })
  })

  it('una fila armada con la regla de hoy no se marca', () => {
    const r = evaluarBaseGuardado({
      baseGuardado: 200000,
      ajusteGuardado: 15000,
      contrato: CONTRATO,
      guardadas,
      lectura: lectura(96, 96),
      quincena: Q1_AGOSTO,
    })

    expect(r.desactualizado).toBe(false)
  })

  // El ajuste ya no se digita: uno puesto a mano se marca siempre.
  it('marca un ajuste que no es el de la regla', () => {
    const r = evaluarBaseGuardado({
      baseGuardado: 200000,
      ajusteGuardado: 30000,
      contrato: CONTRATO,
      guardadas,
      lectura: lectura(96, 96),
      quincena: Q1_AGOSTO,
    })

    expect(r.desactualizado).toBe(true)
  })

  it('un BASE editado a mano se respeta si el ajuste es el de la regla', () => {
    const r = evaluarBaseGuardado({
      baseGuardado: 212345,
      ajusteGuardado: 15000,
      contrato: CONTRATO,
      guardadas,
      lectura: lectura(96, 96),
      quincena: Q1_AGOSTO,
    })

    expect(r.desactualizado).toBe(false)
  })

  it('sin lectura utilizable no se puede decir nada', () => {
    const r = evaluarBaseGuardado({
      baseGuardado: 1,
      ajusteGuardado: 1,
      contrato: CONTRATO,
      guardadas,
      lectura: null,
      quincena: Q1_AGOSTO,
    })

    expect(r).toEqual({ desactualizado: false, esperado: null, ajusteEsperado: null })
  })
})

describe('baseParaHorasEditadas', () => {
  // La plantilla prellenó 200.000 por 96 h; en el Excel le bajan las horas a
  // 48 y dejan el monto. El ajuste sigue a las 48 h: el base tiene que seguirlas.
  it('un BASE del sistema sigue a las horas nuevas', () => {
    const r = baseParaHorasEditadas({
      baseIngresado: 200000,
      contrato: CONTRATO,
      lectura: lectura(96, 96),
      horasPrevias: null,
      horasNuevas: { horas: 48, horasExtra: 0 },
      quincena: Q1_AGOSTO,
    })

    expect(r).toEqual({ base: 100000, conservado: false })
  })

  it('un BASE corregido a mano se respeta', () => {
    const r = baseParaHorasEditadas({
      baseIngresado: 212345,
      contrato: CONTRATO,
      lectura: lectura(96, 96),
      horasPrevias: { horas: 96, horasExtra: 0 },
      horasNuevas: { horas: 48, horasExtra: 0 },
      quincena: Q1_AGOSTO,
    })

    expect(r).toEqual({ base: 212345, conservado: true })
  })

  it('sin lectura no hay con qué recalcular: queda lo que llegó', () => {
    const r = baseParaHorasEditadas({
      baseIngresado: 200000,
      contrato: CONTRATO,
      lectura: null,
      horasPrevias: null,
      horasNuevas: { horas: 48, horasExtra: 0 },
      quincena: Q1_AGOSTO,
    })

    expect(r.base).toBe(200000)
  })
})
