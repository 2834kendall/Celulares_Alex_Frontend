import { describe, expect, it } from 'vitest'
import {
  PROBLEMAS_QUE_BLOQUEAN,
  calcularDia,
  calcularHorasPeriodo,
  lecturaUtilizable,
  type DiaProgramado,
  type HorarioDia,
  type JustificacionDia,
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

  // Antes un día libre con marcas se callaba: las horas desaparecían sin
  // rastro. Trabajar el día de descanso se paga doble (Art. 152 CT), así que
  // alguien lo tiene que ver. Es un aviso: no bloquea el pago.
  it('un día libre con marcas se avisa, sin contar las horas ni bloquear', () => {
    const r = calcularDia(
      dia({
        horario: null,
        esDiaLibre: true,
        marcas: [marca('entrada', '2026-07-06 08:00:00')],
      })
    )

    expect(r.problema).toBe('marco_en_dia_libre')
    expect(PROBLEMAS_QUE_BLOQUEAN.has('marco_en_dia_libre')).toBe(false)
    expect(r.horasOrdinarias).toBe(0)
    expect(r.horasAcreditadas).toBe(0)
  })

  // Sin fila de programación (nadie la cargó) no es lo mismo que un día
  // libre marcado a propósito: es un dato que falta. Sin distinguirlos, un
  // horario a medio cargar pagaba la quincena entera por el único día que sí
  // tenía horario (ver prellenadoAsistencia.ts: cumplimientoQuincena).
  it('un día sin ninguna fila de programación se avisa y NO desaparece del cumplimiento', () => {
    const r = calcularDia(dia({ horario: null, sinProgramar: true }))

    expect(r.problema).toBe('sin_programar')
    expect(r.horasEsperadas).toBe(0)
    expect(r.cuenta).toBe(false)
    expect(r.diaSinProgramar).toBe(1)
    expect(PROBLEMAS_QUE_BLOQUEAN.has('sin_programar')).toBe(false)
  })

  it('un día sin programar pero marcado (trabajó) sigue siendo sin_horario, no sin_programar', () => {
    // Si además marcó, el aviso que importa es 'sin_horario': hay que
    // revisar esas horas, no solo completar el horario.
    const r = calcularDia(
      dia({
        horario: null,
        sinProgramar: true,
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 17:00:00')],
      })
    )

    expect(r.problema).toBe('sin_horario')
    expect(r.diaSinProgramar).toBe(0)
  })
})

// Con salario mensual o quincenal el patrono paga todos los días del periodo
// (MTSS, folleto de Días Feriados). Un feriado o unas vacaciones no se
// trabajan pero SE PAGAN: entran al prorrateo como horas acreditadas. La
// primera versión del prorrateo contra la jornada se olvidó de ellas y media
// quincena de vacaciones cobraba medio salario.
describe('calcularDia: días pagados sin trabajar', () => {
  const ausencia = (over: Partial<JustificacionDia> = {}): JustificacionDia => ({
    motivo: 'ausencia',
    codigo: 'VAC',
    esIntradia: false,
    fraccionPagada: 1,
    ...over,
  })

  it('un feriado programado acredita las horas del horario', () => {
    const r = calcularDia(dia({ esFeriado: true }))

    expect(r.horasEsperadas).toBe(0)
    expect(r.horasAcreditadas).toBe(8)
    expect(r.justificacion?.motivo).toBe('feriado')
    expect(r.problema).toBeNull()
  })

  it('unas vacaciones programadas acreditan el día completo', () => {
    const r = calcularDia(dia({ tieneAusenciaAprobada: true, ausencia: ausencia() }))

    expect(r.horasAcreditadas).toBe(8)
    expect(r.diaAcreditadoSinHorario).toBe(0)
  })

  it('un permiso sin goce no acredita nada', () => {
    const r = calcularDia(
      dia({
        tieneAusenciaAprobada: true,
        ausencia: ausencia({ codigo: 'PERM_SG', fraccionPagada: 0 }),
      })
    )

    expect(r.horasAcreditadas).toBe(0)
    expect(r.justificacion?.fraccionPagada).toBe(0)
  })

  it('un día pagado sin horario se deja como fracción de día y se avisa', () => {
    const r = calcularDia(dia({ horario: null, tieneAusenciaAprobada: true, ausencia: ausencia() }))

    expect(r.horasAcreditadas).toBe(0)
    expect(r.diaAcreditadoSinHorario).toBe(1)
    expect(r.problema).toBe('justificado_sin_horario')
    expect(PROBLEMAS_QUE_BLOQUEAN.has('justificado_sin_horario')).toBe(false)
  })

  // Trabajar un feriado se paga doble: el día ya está en el salario y se debe
  // un salario diario más. Esas horas no pueden desaparecer en silencio.
  it('un feriado con marcas se avisa para pagar el doble', () => {
    const r = calcularDia(
      dia({
        esFeriado: true,
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 17:00:00')],
      })
    )

    expect(r.problema).toBe('trabajo_en_feriado')
    expect(r.horasAcreditadas).toBe(8)
    expect(PROBLEMAS_QUE_BLOQUEAN.has('trabajo_en_feriado')).toBe(false)
  })

  it('una ausencia con marcas se avisa', () => {
    const r = calcularDia(
      dia({
        tieneAusenciaAprobada: true,
        ausencia: ausencia(),
        marcas: [marca('entrada', '2026-07-06 08:00:00')],
      })
    )

    expect(r.problema).toBe('marco_con_ausencia')
  })

  // Lactancia: se trabaja el día y la ausencia solo cubre lo que faltó. Las
  // horas trabajadas —extras incluidas— siguen contando.
  it('un permiso intradía cubre solo lo que faltó y deja contar lo trabajado', () => {
    const r = calcularDia(
      dia({
        tieneAusenciaAprobada: true,
        ausencia: ausencia({ codigo: 'LACT', esIntradia: true }),
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 16:00:00')],
      })
    )

    expect(r.horasOrdinarias).toBe(7)
    expect(r.horasAcreditadas).toBe(1)
    expect(r.horasEsperadas).toBe(8)
    expect(r.problema).toBeNull()
  })

  // Art. 97 CT: una hora por día. Sin tope, 4 h de atraso se pagaban enteras.
  it('el permiso intradía acredita como máximo una hora por día', () => {
    const r = calcularDia(
      dia({
        tieneAusenciaAprobada: true,
        ausencia: ausencia({ codigo: 'LACT', esIntradia: true }),
        marcas: [marca('entrada', '2026-07-06 12:00:00'), marca('salida', '2026-07-06 16:00:00')],
      })
    )

    expect(r.horasAcreditadas).toBe(1)
  })

  it('el día libre gana sobre el feriado: el descanso no se acredita aparte', () => {
    const r = calcularDia(dia({ esDiaLibre: true, esFeriado: true }))

    expect(r.horasAcreditadas).toBe(0)
    expect(r.diaAcreditadoSinHorario).toBe(0)
  })

  it('una fracción fuera de rango se recorta, nunca paga de más', () => {
    const r = calcularDia(
      dia({ tieneAusenciaAprobada: true, ausencia: ausencia({ fraccionPagada: 7 }) })
    )

    expect(r.horasAcreditadas).toBe(8)
  })
})

describe('calcularHorasPeriodo: días pagados', () => {
  it('suma acreditadas y cuenta los días justificados', () => {
    const t = calcularHorasPeriodo([
      dia({ fecha: '2026-07-06', esFeriado: true }),
      dia({
        fecha: '2026-07-07',
        horario: null,
        tieneAusenciaAprobada: true,
        ausencia: { motivo: 'ausencia', codigo: 'VAC', esIntradia: false, fraccionPagada: 1 },
      }),
      dia({
        fecha: '2026-07-08',
        marcas: [marca('entrada', '2026-07-08 08:00:00'), marca('salida', '2026-07-08 17:00:00')],
      }),
    ])

    expect(t.horasEsperadas).toBe(8)
    expect(t.horasOrdinarias).toBe(8)
    expect(t.horasAcreditadas).toBe(8)
    expect(t.diasAcreditadosSinHorario).toBe(1)
    expect(t.diasJustificados).toBe(2)
    // Los avisos de días pagados no bloquean el pago.
    expect(t.diasQueBloquean).toEqual([])
  })

  // Una quincena entera de vacaciones, feriados o incapacidad no tiene horas
  // esperadas y SÍ es una lectura. Antes caía al supuesto de jornada completa
  // y pagaba el salario entero también en una incapacidad o un permiso sin goce.
  it('una quincena sin horas esperadas pero con días justificados es una lectura válida', () => {
    const t = calcularHorasPeriodo([
      dia({
        tieneAusenciaAprobada: true,
        ausencia: { motivo: 'ausencia', codigo: 'INC_ENF', esIntradia: false, fraccionPagada: 0 },
      }),
    ])

    expect(t.horasEsperadas).toBe(0)
    expect(t.periodoCubiertoPorAusencias).toBe(true)
    expect(lecturaUtilizable(t)).toBe(true)
  })

  // Sin ningún día justificado no hay nada que "cubra" la quincena: es una
  // programación que no sirve. Antes pagaba ₡0 y dejaba marcar el pago.
  it('una quincena solo de días libres no es una lectura válida', () => {
    const t = calcularHorasPeriodo([
      dia({ fecha: '2026-07-06', esDiaLibre: true }),
      dia({ fecha: '2026-07-07', esDiaLibre: true }),
    ])

    expect(t.periodoCubiertoPorAusencias).toBe(false)
    expect(lecturaUtilizable(t)).toBe(false)
  })

  it('un día justificado entre días sin horario NO vuelve útil la lectura', () => {
    const t = calcularHorasPeriodo([
      dia({
        fecha: '2026-07-06',
        horario: null,
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 17:00:00')],
      }),
      dia({
        fecha: '2026-07-07',
        horario: null,
        tieneAusenciaAprobada: true,
        ausencia: { motivo: 'ausencia', codigo: 'VAC', esIntradia: false, fraccionPagada: 1 },
      }),
    ])

    expect(t.periodoCubiertoPorAusencias).toBe(false)
    expect(lecturaUtilizable(t)).toBe(false)
  })

  // Un subsidio suspende el salario: un feriado dentro de una incapacidad no
  // se acredita en el base (si no, se pagaba dos veces: base + subsidio).
  it('un feriado dentro de una incapacidad no se acredita', () => {
    const r = calcularDia(
      dia({
        esFeriado: true,
        tieneAusenciaAprobada: true,
        ausencia: {
          motivo: 'ausencia',
          codigo: 'INC_ENF',
          esIntradia: false,
          fraccionPagada: 0,
          esSubsidio: true,
        },
      })
    )

    expect(r.horasAcreditadas).toBe(0)
    expect(r.justificacion?.codigo).toBe('INC_ENF')
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

  // Decisión del negocio: tenía horario y no marcó → 0 h, no traba el pago.
  it('un día sin ninguna marca cuenta 0 h, suma a lo programado y no bloquea', () => {
    const r = calcularDia(dia({ marcas: [] }))

    expect(r.horasOrdinarias).toBe(0)
    expect(r.horasProgramadasDia).toBe(8)
    expect(PROBLEMAS_QUE_BLOQUEAN.has('sin_marcas')).toBe(false)
  })
})

describe('calcularDia: el horario manda', () => {
  // El horario empieza a contar a la hora de entrada programada.
  it('llegar antes de la entrada no genera extra', () => {
    const r = calcularDia(
      dia({
        marcas: [marca('entrada', '2026-07-06 07:00:00'), marca('salida', '2026-07-06 17:00:00')],
      })
    )

    expect(r.horasTrabajadas).toBe(8)
    expect(r.horasOrdinarias).toBe(8)
    expect(r.horasExtra).toBe(0)
  })

  it('quedarse después de la salida sí es extra', () => {
    const r = calcularDia(
      dia({
        marcas: [marca('entrada', '2026-07-06 08:00:00'), marca('salida', '2026-07-06 18:00:00')],
      })
    )

    expect(r.horasOrdinarias).toBe(8)
    expect(r.horasExtra).toBe(1)
  })

  // Antes se restaba solo la hora programada: el almuerzo de 2 h contaba una
  // hora como trabajada, y si se quedaba a reponerla salía como extra.
  it('un almuerzo más largo que lo programado rebaja horas, no las vuelve extra', () => {
    const r = calcularDia(
      dia({
        marcas: [
          marca('entrada', '2026-07-06 08:00:00'),
          marca('inicio_almuerzo', '2026-07-06 12:00:00'),
          marca('fin_almuerzo', '2026-07-06 14:00:00'),
          marca('salida', '2026-07-06 18:00:00'),
        ],
      })
    )

    // 10 h de presencia − 2 h de almuerzo = 8 h: ninguna extra.
    expect(r.horasTrabajadas).toBe(8)
    expect(r.horasExtra).toBe(0)
  })

  it('un almuerzo más corto no suma tiempo trabajado', () => {
    const r = calcularDia(
      dia({
        marcas: [
          marca('entrada', '2026-07-06 08:00:00'),
          marca('inicio_almuerzo', '2026-07-06 12:00:00'),
          marca('fin_almuerzo', '2026-07-06 12:30:00'),
          marca('salida', '2026-07-06 17:00:00'),
        ],
      })
    )

    expect(r.horasTrabajadas).toBe(8)
    expect(r.horasExtra).toBe(0)
  })

  it('un receso más largo resta lo que pasa de los minutos pagados', () => {
    const r = calcularDia(
      dia({
        horario: { ...HORARIO_8H, inicioBreak: '10:00:00', finBreak: '10:10:00' },
        marcas: [
          marca('entrada', '2026-07-06 08:00:00'),
          marca('inicio_receso', '2026-07-06 10:00:00'),
          marca('fin_receso', '2026-07-06 10:40:00'),
          marca('salida', '2026-07-06 17:00:00'),
        ],
      })
    )

    // 40 min de receso − 10 pagados = 30 min menos.
    expect(r.horasTrabajadas).toBe(7.5)
    expect(r.horasExtra).toBe(0)
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
    expect(r.horasProgramadasTotales).toBe(24)
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

  // El bug real: a alguien se le carga horario para un solo día de la
  // quincena, lo trabaja completo, y los otros 14 días no tienen ninguna
  // fila de programación. Sin diasSinProgramar, horasProgramadasTotales
  // salía en 8 y el cumplimiento daba 100 % por un día de trabajo.
  it('un horario a medio cargar: los días sin fila se avisan y suman al cumplimiento pendiente', () => {
    const sinProgramar = Array.from({ length: 14 }, (_, i) =>
      dia({ fecha: `2026-07-${String(i + 7).padStart(2, '0')}`, horario: null, sinProgramar: true })
    )

    const r = calcularHorasPeriodo([jornadaCompleta('2026-07-06'), ...sinProgramar])

    expect(r.horasProgramadasTotales).toBe(8) // solo el día con horario cargado
    expect(r.diasSinProgramar).toBe(14)
    expect(r.diasConProblema.filter((d) => d.problema === 'sin_programar')).toHaveLength(14)
    expect(r.diasQueBloquean).toEqual([]) // avisa, no bloquea (decisión del negocio)
  })
})
