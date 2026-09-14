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

    // Lo que importa acá no es solo el trabajado: las 8 esperadas tambien
    // tienen que cruzar medianoche. Si el horario se midiera como resta del
    // mismo dia daria 0 esperadas y las 8 trabajadas saldrian todas como
    // extra, pagadas a tiempo y medio sin que nadie lo notara.
    expect(r.horasEsperadas).toBe(8)
    expect(r.horasTrabajadas).toBe(8)
    expect(r.horasOrdinarias).toBe(8)
    expect(r.horasExtra).toBe(0)
  })

  it('un almuerzo de madrugada dentro de un turno nocturno también se descuenta', () => {
    const horario: HorarioDia = {
      entrada: '22:00:00',
      salida: '07:00:00',
      inicioAlmuerzo: '01:00:00',
      finAlmuerzo: '02:00:00',
      inicioBreak: null,
      finBreak: null,
    }

    const r = calcularDia(
      dia({
        horario,
        marcas: [marca('entrada', '2026-07-06 22:00:00'), marca('salida', '2026-07-07 07:00:00')],
      })
    )

    expect(r.horasEsperadas).toBe(8) // 9 de jornada menos el almuerzo
    expect(r.horasTrabajadas).toBe(8)
    expect(r.horasExtra).toBe(0)
  })
})

// Las marcas llegan de PostgREST en ISO, con "T" entre fecha y hora
// ("2026-08-04T08:00:00"), no con un espacio como se ven en el SQL Editor.
// Todos los tests de acá usaban el espacio, así que el parser partido por " "
// pasaba verde mientras en producción devolvía NaN: la pantalla mostraba las
// horas PROGRAMADAS bien (salen del horario, que es texto) y las TRABAJADAS
// como "NaN", y guardar la fila fallaba.
describe('calcularDia: formato de fecha de las marcas', () => {
  const iso = (tipo: RawMark['tipo'], fechaHora: string) => marca(tipo, fechaHora)

  it('lee las marcas en ISO con T, igual que con espacio', () => {
    const conT = calcularDia(
      dia({
        marcas: [iso('entrada', '2026-07-06T08:00:00'), iso('salida', '2026-07-06T17:00:00')],
      })
    )

    expect(conT.horasTrabajadas).toBe(8)
    expect(conT.horasOrdinarias).toBe(8)
    expect(conT.problema).toBeNull()
  })

  it('en ISO también cuenta la hora extra', () => {
    const r = calcularDia(
      dia({
        marcas: [iso('entrada', '2026-07-06T08:00:00'), iso('salida', '2026-07-06T20:00:00')],
      })
    )

    expect(r.horasTrabajadas).toBe(11)
    expect(r.horasOrdinarias).toBe(8)
    expect(r.horasExtra).toBe(3)
  })

  it('un turno nocturno en ISO cruza medianoche bien', () => {
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
        marcas: [iso('entrada', '2026-07-06T22:00:00'), iso('salida', '2026-07-07T06:00:00')],
      })
    )

    expect(r.horasTrabajadas).toBe(8)
    expect(r.horasExtra).toBe(0)
  })

  // Si una marca no se puede leer, no puede convertirse en NaN y seguir: se
  // reporta, se ve de qué día es, y bloquea el pago hasta arreglarla.
  it('una marca ilegible se reporta en vez de producir NaN', () => {
    const r = calcularDia(
      dia({
        marcas: [marca('entrada', 'basura'), marca('salida', '2026-07-06 17:00:00')],
      })
    )

    expect(r.problema).toBe('marca_ilegible')
    expect(Number.isFinite(r.horasTrabajadas)).toBe(true)
    expect(r.horasTrabajadas).toBe(0)
    expect(r.horasEsperadas).toBe(8)
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

  // Sin horario el día no puede sumar: no hay jornada contra la cual medir.
  // Pero si la persona MARCÓ, callarlo dejaba el día en cero sin ninguna
  // explicación, y parecía que el kiosco no había registrado nada.
  it('un día sin horario pero CON marcas se reporta como problema', () => {
    const r = calcularDia(
      dia({
        horario: null,
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 17:00:00')],
      })
    )

    expect(r.problema).toBe('sin_horario')
    expect(r.horasEsperadas).toBe(0)
    expect(r.horasOrdinarias).toBe(0)
    expect(r.cuenta).toBe(false)
  })

  // Un día libre o feriado con marcas tampoco es "sin horario": esos ya se
  // resolvieron antes y no hay nada que avisar.
  it('un día libre con marcas sigue sin reportar problema', () => {
    const r = calcularDia(
      dia({
        horario: null,
        esDiaLibre: true,
        marcas: [marca('entrada', '2026-07-06 08:00:00')],
      })
    )

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
    expect(r.diasQueBloquean).toEqual([{ fecha: '2026-07-08', problema: 'sin_salida' }])
  })

  // 'sin_horario' se avisa pero NO traba el pago. Si trabara, una marca suelta
  // en un día que nadie programó dejaría la quincena entera sin poder pagarse,
  // y la única salida sería asignarle un horario a ese día — lo que sube las
  // horas esperadas y BAJA el valor de la hora de todo el periodo. Destrabar
  // el pago terminaría cambiando el monto.
  it('un día sin horario se avisa pero no bloquea el pago', () => {
    const r = calcularHorasPeriodo([
      jornadaCompleta('2026-07-06'),
      dia({
        fecha: '2026-07-12',
        horario: null,
        marcas: [marca('entrada', '2026-07-12 09:00:00'), marca('salida', '2026-07-12 12:00:00')],
      }),
    ])

    expect(r.diasConProblema).toEqual([{ fecha: '2026-07-12', problema: 'sin_horario' }])
    expect(r.diasQueBloquean).toEqual([])
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
