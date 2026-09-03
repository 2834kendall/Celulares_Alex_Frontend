import { describe, expect, it } from 'vitest'
import {
  calcularDia,
  calcularHorasPeriodo,
  salarioPorHoraPeriodo,
  type DiaProgramado,
  type HorarioDia,
} from './horasPeriodo'
import type { RawMark } from '@/modules/attendance/lib/marks'

/** Jornada diurna típica: 8:00 a 17:00 con una hora de almuerzo = 8 h pagadas. */
const HORARIO_8H: HorarioDia = {
  entrada: '08:00:00',
  salida: '17:00:00',
  inicioAlmuerzo: '12:00:00',
  finAlmuerzo: '13:00:00',
  inicioBreak: null,
  finBreak: null,
}

let id = 0
function marca(tipo: RawMark['tipo'], fechaHora: string): RawMark {
  id += 1
  return { id, tipo, fechaHora }
}

function dia(over: Partial<DiaProgramado> = {}): DiaProgramado {
  return {
    fecha: '2026-07-06',
    horario: HORARIO_8H,
    esDiaLibre: false,
    esFeriado: false,
    tieneAusenciaAprobada: false,
    marcas: [],
    ...over,
  }
}

describe('calcularDia', () => {
  it('una jornada completa da las horas programadas, sin extra', () => {
    const r = calcularDia(
      dia({
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 17:00:00')],
      })
    )

    expect(r.horasEsperadas).toBe(8)
    expect(r.horasTrabajadas).toBe(8)
    expect(r.horasOrdinarias).toBe(8)
    expect(r.horasExtra).toBe(0)
    expect(r.problema).toBeNull()
  })

  it('la hora de almuerzo no se paga', () => {
    // 9 horas de presencia (8:00-17:00) menos 1 de almuerzo = 8 pagadas.
    const r = calcularDia(
      dia({
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 17:00:00')],
      })
    )

    expect(r.horasTrabajadas).toBe(8)
  })

  it('irse antes del almuerzo no descuenta un almuerzo que no ocurrió', () => {
    // 8:00 a 11:00 = 3 h. La ventana de almuerzo (12-13) no se traslapa, así
    // que no se resta: si se restara completa quedarían 2 h y la persona
    // perdería una hora que sí trabajó.
    const r = calcularDia(
      dia({
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 11:00:00')],
      })
    )

    expect(r.horasTrabajadas).toBe(3)
    expect(r.horasOrdinarias).toBe(3)
    expect(r.horasExtra).toBe(0)
  })

  it('lo que pasa de la jornada programada es hora extra', () => {
    const r = calcularDia(
      dia({
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 19:00:00')],
      })
    )

    expect(r.horasTrabajadas).toBe(10) // 11 de presencia menos el almuerzo
    expect(r.horasOrdinarias).toBe(8)
    expect(r.horasExtra).toBe(2)
  })

  it('quien tiene pactada una jornada larga no genera extra por cumplirla', () => {
    // Jornada acumulativa de 12 h: 6:00 a 19:00 con una hora de almuerzo.
    const horario: HorarioDia = {
      entrada: '06:00:00',
      salida: '19:00:00',
      inicioAlmuerzo: '12:00:00',
      finAlmuerzo: '13:00:00',
      inicioBreak: null,
      finBreak: null,
    }

    const r = calcularDia(
      dia({
        horario,
        marcas: [marca('entrada', '2026-07-06 06:00:00'), marca('salida', '2026-07-06 19:00:00')],
      })
    )

    expect(r.horasEsperadas).toBe(12)
    expect(r.horasTrabajadas).toBe(12)
    expect(r.horasExtra).toBe(0)
  })

  it('un turno que cruza medianoche se mide completo', () => {
    const horario: HorarioDia = {
      entrada: '22:00:00',
      salida: '06:00:00',
      inicioAlmuerzo: null,
      finAlmuerzo: null,
      inicioBreak: null,
      finBreak: null,
    }

    const r = calcularDia(
      dia({
        horario,
        marcas: [marca('entrada', '2026-07-06 22:00:00'), marca('salida', '2026-07-07 06:00:00')],
      })
    )

    expect(r.horasTrabajadas).toBe(8)
  })
})

describe('calcularDia: días que no rebajan el salario', () => {
  it.each([
    ['un día libre', { esDiaLibre: true }],
    ['un feriado', { esFeriado: true }],
    ['una ausencia aprobada', { tieneAusenciaAprobada: true }],
    ['un día sin programación', { horario: null }],
  ])('%s no suma horas esperadas ni reporta problema', (_caso, over) => {
    const r = calcularDia(dia({ ...over, marcas: [] }))

    expect(r.horasEsperadas).toBe(0)
    expect(r.cuenta).toBe(false)
    expect(r.problema).toBeNull()
  })
})

describe('calcularDia: marcas incompletas', () => {
  it('entrada sin salida no se adivina: se reporta', () => {
    const r = calcularDia(dia({ marcas: [marca('entrada', '2026-07-06 08:00:00')] }))

    expect(r.problema).toBe('sin_salida')
    expect(r.horasTrabajadas).toBe(0)
    // Las esperadas se conservan: el día sigue contando para el prorrateo.
    expect(r.horasEsperadas).toBe(8)
  })

  it('salida sin entrada también se reporta', () => {
    const r = calcularDia(dia({ marcas: [marca('salida', '2026-07-06 17:00:00')] }))

    expect(r.problema).toBe('sin_entrada')
  })

  it('un día programado sin ninguna marca se reporta', () => {
    const r = calcularDia(dia({ marcas: [] }))

    expect(r.problema).toBe('sin_marcas')
  })
})

describe('calcularHorasPeriodo', () => {
  const jornadaCompleta = (fecha: string) =>
    dia({
      fecha,
      marcas: [marca('entrada', `${fecha} 08:00:00`), marca('salida', `${fecha} 17:00:00`)],
    })

  it('suma la quincena y deja los días con problema aparte', () => {
    const r = calcularHorasPeriodo([
      jornadaCompleta('2026-07-06'),
      jornadaCompleta('2026-07-07'),
      dia({ fecha: '2026-07-08', marcas: [marca('entrada', '2026-07-08 08:00:00')] }),
      dia({ fecha: '2026-07-11', esDiaLibre: true }),
    ])

    expect(r.horasEsperadas).toBe(24) // los tres días programados
    expect(r.horasOrdinarias).toBe(16) // solo dos se pudieron liquidar
    expect(r.diasConProblema).toEqual([{ fecha: '2026-07-08', problema: 'sin_salida' }])
  })

  it('acumula las horas extra de cada día', () => {
    const largo = dia({
      fecha: '2026-07-07',
      marcas: [marca('entrada', '2026-07-07 08:00:00'), marca('salida', '2026-07-07 19:00:00')],
    })

    const r = calcularHorasPeriodo([jornadaCompleta('2026-07-06'), largo])

    expect(r.horasOrdinarias).toBe(16)
    expect(r.horasExtra).toBe(2)
  })
})

describe('salarioPorHoraPeriodo', () => {
  it('cumplir la jornada completa paga exactamente el base de la quincena', () => {
    const horasEsperadas = 88
    const porHora = salarioPorHoraPeriodo(600000, horasEsperadas)

    expect(porHora).toBe(3409.09)
    // 88 h trabajadas x el valor hora ≈ la mitad del salario mensual.
    expect(Math.round(porHora * horasEsperadas)).toBe(300000)
  })

  it('una quincena con menos horas programadas sube el valor de la hora', () => {
    // Un feriado dentro de la quincena baja las horas esperadas; el trabajador
    // no puede salir perdiendo por eso.
    expect(salarioPorHoraPeriodo(600000, 80)).toBe(3750)
  })

  it('sin horas programadas no se puede prorratear', () => {
    expect(salarioPorHoraPeriodo(600000, 0)).toBe(0)
  })
})
