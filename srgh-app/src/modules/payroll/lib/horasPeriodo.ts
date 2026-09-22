/**
 * Horas trabajadas de una quincena, a partir de las marcas de asistencia.
 *
 * Hasta ahora las horas de la planilla eran un número que alguien digitaba: la
 * plantilla de Excel las prellenaba en 88 y nada las conectaba con el kiosco.
 * Este módulo es el puente que faltaba.
 *
 * La regla de "horas = presencia − almuerzo − exceso de break" es la misma que
 * ya aplica la pantalla de horarios (schedules/lib/hours.ts) y de ahí se
 * importa la constante de break pagado. Lo que no se puede reutilizar es su
 * `hoursBetween`: resta las horas como números del mismo día, así que un turno
 * de 22:00 a 06:00 le da negativo y lo recorta a 0. Acá todas las horas del
 * horario se normalizan contra la entrada, que es lo que hace que un turno
 * nocturno mida 8 h y no 0.
 *
 * Reglas (definidas con el negocio):
 *  - Si la persona trabajó menos horas de las que tenía programadas, cobra
 *    proporcionalmente menos: el cumplimiento (cumplidas ÷ programadas) lo
 *    aplica lib/prellenadoAsistencia.ts.
 *  - La hora de almuerzo no se paga: se resta siempre, igual que en la
 *    pantalla de horarios.
 *  - Es hora extra lo que pasa de las horas PROGRAMADAS de ese día, no de un
 *    número fijo. Así, quien tiene pactada una jornada de 12 h no genera extra
 *    por trabajar 12 h — y quien tiene 8 sí la genera a la novena.
 *  - Un día libre o sin programación no cuenta: ni suma horas esperadas ni
 *    acredita nada.
 *  - Un feriado o una ausencia aprobada tampoco suman horas ESPERADAS, pero sí
 *    horas ACREDITADAS: tiempo que se paga como salario sin haberse trabajado.
 *    Con salario mensual o quincenal "están pagados todos los días del mes
 *    (hasta treinta)" (MTSS, folleto de Días Feriados, Arts. 147-152 CT): un
 *    feriado o unas vacaciones nunca pueden rebajar el base. Cuánto se acredita
 *    de cada ausencia lo decide su tipo en el catálogo (ver JustificacionDia):
 *    vacaciones y permisos con goce, completo; permisos sin goce, nada; y las
 *    incapacidades y licencias certificadas por la CCSS o el INS, nada en el
 *    base, porque durante ellas el salario se suspende y lo que corresponde se
 *    paga como subsidio por su propio camino (registrarIncapacidad).
 *  - Un día programado con marcas incompletas no se "adivina": se reporta como
 *    problema y bloquea el pago hasta que alguien corrija la marca.
 *  - Un día programado SIN NINGUNA marca cuenta 0 horas: no se paga y baja el
 *    cumplimiento de la quincena, pero no traba el pago (decisión del
 *    negocio). Queda como aviso en el detalle.
 *  - El tiempo cuenta desde la hora de ENTRADA del horario: llegar antes no
 *    genera extra. Quedarse después de la salida sí (banco de horas).
 *  - Si marcó el almuerzo o el receso, se resta lo que de verdad duró cuando
 *    pasa de lo programado: alargar el almuerzo rebaja horas, no las vuelve
 *    extra. Acortarlo no suma nada.
 */

import { groupIntoDayJourney, type RawMark } from '@/modules/attendance/lib/marks'
import { PAID_BREAK_MINUTES } from '@/modules/schedules/lib/hours'
import { round2 } from '@/modules/payroll/lib/numeros'

const MINUTOS_POR_DIA = 24 * 60

/** Horario efectivo del día: el del catálogo con los `_custom` de la programación ya aplicados. */
export interface HorarioDia {
  /** 'HH:mm' o 'HH:mm:ss'. */
  entrada: string
  salida: string
  inicioAlmuerzo: string | null
  finAlmuerzo: string | null
  inicioBreak: string | null
  finBreak: string | null
}

export interface DiaProgramado {
  /** 'YYYY-MM-DD'. */
  fecha: string
  /** null = ese día no tiene programación. */
  horario: HorarioDia | null
  esDiaLibre: boolean
  esFeriado: boolean
  /** Cubierto por una ausencia aprobada (vacaciones, incapacidad, permiso). */
  tieneAusenciaAprobada: boolean
  /** La ausencia aprobada con su tipo. Si falta, ver justificacionDelDia. */
  ausencia?: JustificacionDia | null
  /** Marcas de ESE empleado en ESE día (filtrar es responsabilidad de quien llama). */
  marcas: RawMark[]
  /**
   * true = no existe ninguna fila de programación para esta fecha (nadie la
   * cargó), a diferencia de un día libre marcado a propósito. Sin esto, un
   * horario a medio cargar era indistinguible de una jornada corta: el día
   * desaparecía del cálculo sin avisar y bajaba el denominador del
   * cumplimiento en vez de subir lo que falta por trabajar.
   */
  sinProgramar?: boolean
}

/**
 * Por qué un día se paga aunque no se haya trabajado, o se haya trabajado de
 * menos.
 */
export interface JustificacionDia {
  motivo: 'feriado' | 'ausencia'
  /** tau_codigo de la ausencia (VAC, PERM_CG…); null en un feriado. */
  codigo: string | null
  /**
   * true = permiso de horas dentro del día (lactancia). El día se calcula con
   * sus marcas como cualquier otro, y la ausencia cubre solo lo que faltó.
   */
  esIntradia: boolean
  /**
   * Parte del tiempo que se paga como SALARIO: 1 = completo, 0 = nada. Cero
   * tanto en un permiso sin goce como en una incapacidad certificada, que sí
   * se paga, pero como subsidio y por otro camino.
   */
  fraccionPagada: number
  /**
   * Incapacidad o licencia certificada por la CCSS o el INS. Mientras dura,
   * el salario se suspende: le gana a un feriado y a cualquier otra ausencia
   * que caiga el mismo día. Si no, ese día se pagaba dos veces (base +
   * subsidio).
   */
  esSubsidio?: boolean
}

/** Por qué un día no se pudo liquidar solo, o qué hay que mirar de él. */
export type ProblemaDia =
  | 'sin_marcas'
  | 'sin_entrada'
  | 'sin_salida'
  | 'sin_horario'
  | 'marca_ilegible'
  | 'trabajo_en_feriado'
  | 'marco_con_ausencia'
  | 'marco_en_dia_libre'
  | 'justificado_sin_horario'
  | 'sin_programar'

export const MENSAJE_PROBLEMA: Record<ProblemaDia, string> = {
  sin_marcas:
    'Tenía horario y no registró ninguna marca: el día cuenta 0 horas y no se paga. Si estuvo ausente con permiso o vacaciones, registrá la ausencia en Ausencias.',
  sin_entrada: 'Hay marca de salida pero no de entrada.',
  sin_salida: 'Hay marca de entrada pero no de salida.',
  marca_ilegible: 'La fecha y hora de una marca de ese día no se pudo leer. Avisá a soporte.',
  sin_horario:
    'Marcó ese día pero no tenía horario programado, así que esas horas no se contaron. Si de verdad trabajó, asignále el horario en Horarios; si no, dejalo así.',
  trabajo_en_feriado:
    'Marcó en un feriado. El día ya está pagado en su salario, pero si trabajó, por ley se le debe un salario diario más (pago doble): agregalo con el concepto Feriado. Esas horas no entran solas a la planilla.',
  marco_con_ausencia:
    'Marcó en un día cubierto por una ausencia aprobada, así que esas horas no se contaron. Si de verdad trabajó, corregí o anulá la ausencia en Ausencias.',
  marco_en_dia_libre:
    'Marcó en su día libre, así que esas horas no se contaron. Si de verdad trabajó, programá el día en Horarios; trabajar el día de descanso se paga doble (Art. 152 CT).',
  justificado_sin_horario:
    'Día pagado (feriado o ausencia aprobada) sin horario programado: se le acreditó la jornada diaria promedio del contrato (horas semanales ÷ 7). Si ese día tenía horario, programalo para que se acredite exacto.',
  sin_programar:
    'No hay programación para este día: ni horario, ni día libre, ni feriado, ni ausencia. No se pudo medir, así que cuenta como jornada sin cumplir para el cálculo de la quincena y baja lo que corresponde cobrar. Completá el horario de ese día o marcalo como libre.',
}

/**
 * Problemas que BLOQUEAN marcar el pago, porque significan que las horas
 * calculadas están cortas por un fallo del kiosco o un olvido.
 *
 * `sin_horario` queda deliberadamente afuera. Es un aviso, no un bloqueo: una
 * marca suelta en un día que nadie programó (un sábado que no estaba previsto,
 * un toque de más en el kiosco, o la salida de madrugada de un turno nocturno
 * que cae en el día de descanso siguiente) trabaría el pago de toda la
 * quincena. Y peor: la única forma de destrabarlo sería asignarle un horario a
 * ese día, lo que sube las horas esperadas del periodo y BAJA el valor de la
 * hora de todo el mundo — o sea, destrabar el pago cambiaría el monto.
 */
export const PROBLEMAS_QUE_BLOQUEAN: ReadonlySet<ProblemaDia> = new Set<ProblemaDia>([
  // 'sin_marcas' ya no bloquea: un día sin ninguna marca cuenta 0 horas y
  // baja el cumplimiento. Una marca a medias sí, porque ahí seguro trabajó
  // y el kiosco o la persona fallaron.
  'sin_entrada',
  'sin_salida',
  'marca_ilegible',
])

export interface DiaCalculado {
  fecha: string
  /** Horas que la persona tenía programadas. 0 si el día no cuenta. */
  horasEsperadas: number
  /** Horas efectivamente trabajadas según las marcas. */
  horasTrabajadas: number
  /** Parte de las trabajadas que cabe dentro de la jornada programada. */
  horasOrdinarias: number
  /** Lo que pasa de la jornada programada de ese día. */
  horasExtra: number
  problema: ProblemaDia | null
  /** true si el día entra en el prorrateo del salario. */
  cuenta: boolean
  /** Feriado o ausencia aprobada que cubre el día, si hay. */
  justificacion: JustificacionDia | null
  /**
   * Horas que se pagan sin haberse trabajado: las programadas del día (o lo
   * que faltó, en un permiso intradía) por la fracción pagada.
   */
  horasAcreditadas: number
  /**
   * Día pagado sin horario programado, como fracción de día (0 a 1). Las horas
   * las pone quien sabe la jornada del contrato (lib/prellenadoAsistencia.ts):
   * este cálculo no la conoce.
   */
  diaAcreditadoSinHorario: number
  /**
   * Horas del horario de ese día, se haya trabajado o no (incluye feriados y
   * ausencias con horario). Es el denominador del cumplimiento de la quincena.
   * 0 en día libre o sin horario.
   */
  horasProgramadasDia: number
  /** 1 si es un feriado o ausencia de día completo sin horario programado. */
  diaJustificadoSinHorario: number
  /**
   * 1 si no había ninguna fila de programación para este día (dato faltante,
   * no un día libre). Cuenta como jornada del contrato sin cumplir en el
   * denominador del cumplimiento (lib/prellenadoAsistencia.ts), para no
   * pagar de más por un horario a medio cargar.
   */
  diaSinProgramar: number
}

/** 'HH:mm' o 'HH:mm:ss' → minutos desde medianoche. */
function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/**
 * 'YYYY-MM-DD HH:mm:ss' → minutos desde la medianoche de `fechaBase`.
 *
 * Se parte por espacio O por 'T', y esa "T" no es un adorno: la columna
 * mar_fecha_hora es `timestamp without time zone`, y PostgREST la devuelve en
 * ISO — "2026-08-04T08:00:00" — mientras que el SQL Editor la muestra con un
 * espacio. Partiendo solo por espacio, la hora quedaba pegada a la fecha, el
 * Date.parse recibía "2026-08-04T08:00:00T00:00:00Z" y devolvía NaN. Ese NaN
 * se propagaba a las horas trabajadas, las ordinarias y las extra, y la
 * pantalla mostraba "NaN" mientras las PROGRAMADAS salían bien (esas vienen del
 * horario, que es texto plano). Guardar esa fila fallaba en silencio.
 *
 * Devuelve NaN si la marca no se puede leer; quien llama tiene que verificarlo
 * (ver calcularDia) en vez de arrastrarlo al cálculo.
 */
function minutosDesde(fechaBase: string, marca: string): number {
  const [fecha, hora = '00:00:00'] = marca.split(/[ T]/)
  const dias = Math.round(
    (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${fechaBase}T00:00:00Z`)) / 86_400_000
  )
  return dias * MINUTOS_POR_DIA + minutosDeHora(hora)
}

/** Minutos en que dos intervalos se traslapan. 0 si no se tocan. */
function solape(inicioA: number, finA: number, inicioB: number, finB: number): number {
  return Math.max(0, Math.min(finA, finB) - Math.max(inicioA, inicioB))
}

/**
 * Hora del horario expresada en minutos desde la medianoche del día en que
 * ARRANCA la jornada. Una hora anterior a la entrada pertenece al día
 * siguiente: en un turno de 22:00 a 06:00, tanto la salida como un almuerzo a
 * la 01:00 caen del otro lado de la medianoche.
 */
function minutosEnJornada(hora: string, entradaMinutos: number): number {
  const minutos = minutosDeHora(hora)
  return minutos < entradaMinutos ? minutos + MINUTOS_POR_DIA : minutos
}

/**
 * Descuentos del día, recortados al tiempo que la persona REALMENTE estuvo.
 *
 * Se recorta a propósito: si alguien se fue antes del almuerzo, restarle la
 * hora completa de almuerzo le quitaría tiempo que sí trabajó. El break sigue
 * la misma regla que la pantalla de horarios — los primeros
 * PAID_BREAK_MINUTES van pagados y solo el exceso se resta.
 */
function minutosDescontables(
  horario: HorarioDia,
  entrada: number,
  salida: number,
  reales: { almuerzo: number | null; receso: number | null } = { almuerzo: null, receso: null }
): number {
  const anclaje = minutosDeHora(horario.entrada)
  const ventana = (inicio: string | null, fin: string | null) =>
    inicio && fin
      ? solape(entrada, salida, minutosEnJornada(inicio, anclaje), minutosEnJornada(fin, anclaje))
      : 0

  // Lo marcado manda solo cuando es MÁS que lo programado: un almuerzo de 2 h
  // con 1 h programada resta 2 h. Uno más corto no suma tiempo trabajado.
  const almuerzo = Math.max(
    ventana(horario.inicioAlmuerzo, horario.finAlmuerzo),
    reales.almuerzo ?? 0
  )
  const brk = Math.max(ventana(horario.inicioBreak, horario.finBreak), reales.receso ?? 0)

  return almuerzo + Math.max(0, brk - PAID_BREAK_MINUTES)
}

/** Minutos entre dos marcas de pausa (inicio y fin). null si falta alguna o no se leen. */
function minutosDePausa(fecha: string, inicio: RawMark | null, fin: RawMark | null): number | null {
  if (!inicio || !fin) return null
  const a = minutosDesde(fecha, inicio.fechaHora)
  let b = minutosDesde(fecha, fin.fechaHora)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (b < a) b += MINUTOS_POR_DIA
  return b - a
}

/**
 * Horas que exige el horario del día: la jornada completa menos el almuerzo y
 * menos el exceso de break sobre lo pagado. Misma regla que la pantalla de
 * horarios, pero con las horas normalizadas contra la entrada para que los
 * turnos que cruzan medianoche midan lo que realmente duran.
 */
function horasProgramadas(horario: HorarioDia): number {
  const entrada = minutosDeHora(horario.entrada)
  const salida = minutosEnJornada(horario.salida, entrada)
  const netos = salida - entrada - minutosDescontables(horario, entrada, salida)
  return round2(Math.max(0, netos / 60))
}

const DIA_VACIO = (
  fecha: string,
  problema: ProblemaDia | null,
  horasEsperadas: number
): DiaCalculado => ({
  fecha,
  horasEsperadas,
  horasTrabajadas: 0,
  horasOrdinarias: 0,
  horasExtra: 0,
  problema,
  cuenta: horasEsperadas > 0,
  justificacion: null,
  horasAcreditadas: 0,
  diaAcreditadoSinHorario: 0,
  horasProgramadasDia: horasEsperadas,
  diaJustificadoSinHorario: 0,
  diaSinProgramar: 0,
})

/**
 * Qué justifica el día, en orden: el día libre no se paga aparte (no es parte
 * de la jornada), el feriado se paga completo y la ausencia según su tipo.
 *
 * `tieneAusenciaAprobada` sin `justificacion` es la forma vieja de avisar una
 * ausencia, sin tipo. Se lee como ausencia pagada completa, que es lo que
 * hacía el cálculo antes de que existiera la fracción.
 */
function justificacionDelDia(dia: DiaProgramado): JustificacionDia | null {
  if (dia.esDiaLibre) return null
  // Un subsidio suspende el salario: un feriado dentro de una incapacidad no
  // se paga en el base (el día ya lo cubre el subsidio).
  if (dia.ausencia?.esSubsidio) return dia.ausencia
  if (dia.esFeriado) {
    return { motivo: 'feriado', codigo: null, esIntradia: false, fraccionPagada: 1 }
  }
  if (dia.ausencia) return dia.ausencia
  if (dia.tieneAusenciaAprobada) {
    return { motivo: 'ausencia', codigo: null, esIntradia: false, fraccionPagada: 1 }
  }
  return null
}

/**
 * Tope diario del permiso intradía. El único del catálogo es lactancia
 * (LACT): Art. 97 CT, una hora por día. Sin tope, llegar 4 h tarde un día con
 * lactancia aprobada se pagaba como si se hubiera trabajado.
 */
export const HORAS_MAX_INTRADIA_POR_DIA = 1

function fraccionValida(f: number): number {
  return Number.isFinite(f) ? Math.min(Math.max(f, 0), 1) : 0
}

/** Calcula un día: cuántas horas tenía que trabajar, cuántas trabajó, y qué falta. */
export function calcularDia(dia: DiaProgramado): DiaCalculado {
  const justificacion = justificacionDelDia(dia)

  // Día libre: no es parte de la jornada, no se acredita. Pero si marcó, no se
  // calla: un día de descanso trabajado se paga doble y alguien lo tiene que
  // decidir.
  if (dia.esDiaLibre) {
    return DIA_VACIO(dia.fecha, dia.marcas.length > 0 ? 'marco_en_dia_libre' : null, 0)
  }

  // Feriado o ausencia de día completo: no suma horas esperadas (no había que
  // venir) pero sí acredita las que se pagan. Las marcas de ese día no se
  // cuentan como trabajo —el día ya está pagado— pero se reportan, porque un
  // feriado trabajado se debe pagar doble y una ausencia con marcas suele
  // ser una ausencia mal cargada.
  if (justificacion && !justificacion.esIntradia) {
    const fraccion = fraccionValida(justificacion.fraccionPagada)
    const programadas = dia.horario ? horasProgramadas(dia.horario) : null

    let problema: ProblemaDia | null = null
    if (dia.marcas.length > 0) {
      problema = justificacion.motivo === 'feriado' ? 'trabajo_en_feriado' : 'marco_con_ausencia'
    } else if (programadas === null && fraccion > 0) {
      problema = 'justificado_sin_horario'
    }

    return {
      ...DIA_VACIO(dia.fecha, problema, 0),
      justificacion: { ...justificacion, fraccionPagada: fraccion },
      horasAcreditadas: programadas === null ? 0 : round2(programadas * fraccion),
      diaAcreditadoSinHorario: programadas === null ? fraccion : 0,
      horasProgramadasDia: programadas ?? 0,
      diaJustificadoSinHorario: programadas === null ? 1 : 0,
    }
  }

  // Sin horario no hay jornada contra la cual medir: no se sabe qué parte de
  // lo que trabajó es ordinario y qué parte es extra, así que el día no puede
  // sumar nada.
  //
  // Pero si la persona MARCÓ ese día, callarlo es peor que el problema: el
  // día aparecía en cero, sin aviso, y quedaba la impresión de que el kiosco
  // no había registrado nada. Se reporta como problema —igual que una marca
  // incompleta— para que alguien le arme el horario y el día pase a contar.
  if (!dia.horario) {
    if (dia.marcas.length > 0) {
      return DIA_VACIO(dia.fecha, 'sin_horario', 0)
    }
    if (dia.sinProgramar) {
      return { ...DIA_VACIO(dia.fecha, 'sin_programar', 0), diaSinProgramar: 1 }
    }
    return DIA_VACIO(dia.fecha, null, 0)
  }

  const horario = dia.horario
  const horasEsperadas = horasProgramadas(horario)

  const jornada = groupIntoDayJourney(dia.marcas)

  if (!jornada.entrada && !jornada.salida) {
    return DIA_VACIO(dia.fecha, 'sin_marcas', horasEsperadas)
  }
  if (!jornada.entrada) {
    return DIA_VACIO(dia.fecha, 'sin_entrada', horasEsperadas)
  }
  if (!jornada.salida) {
    return DIA_VACIO(dia.fecha, 'sin_salida', horasEsperadas)
  }

  const entrada = minutosDesde(dia.fecha, jornada.entrada.fechaHora)
  const salida = minutosDesde(dia.fecha, jornada.salida.fechaHora)

  // Una marca que no se pudo leer NO puede seguir al cálculo: NaN se propaga a
  // las horas trabajadas, a las ordinarias y a las extra, y termina intentando
  // guardarse en la planilla. Se reporta como problema —igual que una marca
  // incompleta— para que se vea qué día es y por qué no cuadra.
  if (!Number.isFinite(entrada) || !Number.isFinite(salida)) {
    return DIA_VACIO(dia.fecha, 'marca_ilegible', horasEsperadas)
  }

  // Turno que cruza medianoche: si la salida quedó antes que la entrada, cayó
  // en el día siguiente. Las ventanas de almuerzo y break del horario se
  // anclan siempre al día en que ARRANCA la jornada.
  const salidaReal = salida < entrada ? salida + MINUTOS_POR_DIA : salida

  // El horario empieza a contar a la hora de entrada programada: llegar antes
  // no es trabajo extra. Quedarse después de la salida sí lo es.
  const entradaEfectiva = Math.max(entrada, minutosDeHora(horario.entrada))

  const reales = {
    almuerzo: minutosDePausa(dia.fecha, jornada.inicioAlmuerzo, jornada.finAlmuerzo),
    receso: minutosDePausa(dia.fecha, jornada.inicioReceso, jornada.finReceso),
  }
  const brutos = Math.max(0, salidaReal - entradaEfectiva)
  const netos = Math.max(
    0,
    brutos - minutosDescontables(horario, entradaEfectiva, salidaReal, reales)
  )

  const horasTrabajadas = round2(netos / 60)
  const horasOrdinarias = round2(Math.min(horasTrabajadas, horasEsperadas))
  const horasExtra = round2(Math.max(0, horasTrabajadas - horasEsperadas))

  // Permiso intradía (lactancia): lo que faltó para completar el día está
  // justificado y se paga según el tipo. Lo trabajado sigue contando igual,
  // extras incluidas.
  const intradia = justificacion?.esIntradia ? justificacion : null
  const faltante = Math.max(0, horasEsperadas - horasOrdinarias)

  return {
    fecha: dia.fecha,
    horasEsperadas,
    horasTrabajadas,
    horasOrdinarias,
    horasExtra,
    problema: null,
    cuenta: true,
    justificacion: intradia,
    horasAcreditadas: intradia
      ? round2(
          Math.min(faltante, HORAS_MAX_INTRADIA_POR_DIA) * fraccionValida(intradia.fraccionPagada)
        )
      : 0,
    diaAcreditadoSinHorario: 0,
    horasProgramadasDia: horasEsperadas,
    diaJustificadoSinHorario: 0,
    diaSinProgramar: 0,
  }
}

export interface TotalesPeriodo {
  /** Horas que la persona tenía programadas en toda la quincena. */
  horasEsperadas: number
  /** Horas trabajadas dentro de la jornada programada — las que pagan el base. */
  horasOrdinarias: number
  /** Horas por encima de la jornada de cada día. Van al banco de horas. */
  horasExtra: number
  /**
   * Horas pagadas sin trabajarse: feriados y ausencias pagadas con horario
   * programado. Entran al prorrateo del base junto a las ordinarias.
   */
  horasAcreditadas: number
  /** Días pagados sin horario programado, en fracción de día. Ver DiaCalculado. */
  diasAcreditadosSinHorario: number
  /** Días de feriado o ausencia de día completo, se paguen o no. */
  diasJustificados: number
  /**
   * true = TODOS los días del periodo son libres o están cubiertos por un
   * feriado o una ausencia de día completo. Es lo único que vuelve útil una
   * lectura sin horas esperadas (ver lecturaUtilizable).
   */
  periodoCubiertoPorAusencias: boolean
  /**
   * Horas del horario de toda la quincena, trabajadas o no, incluidas las de
   * feriados y ausencias con horario. Denominador del cumplimiento.
   */
  horasProgramadasTotales: number
  /** Feriados y ausencias de día completo sin horario programado (días enteros). */
  diasJustificadosSinHorario: number
  /**
   * Días de la quincena sin ninguna fila de programación (ni horario, ni
   * día libre, ni feriado, ni ausencia): dato faltante. Cuentan como jornada
   * del contrato sin cumplir para el cumplimiento (lib/prellenadoAsistencia.ts).
   */
  diasSinProgramar: number
  /** Todos los días con algo que reportar, para mostrarlos en pantalla. */
  diasConProblema: { fecha: string; problema: ProblemaDia }[]
  /** Solo los que impiden marcar el pago (ver PROBLEMAS_QUE_BLOQUEAN). */
  diasQueBloquean: { fecha: string; problema: ProblemaDia }[]
  dias: DiaCalculado[]
}

/**
 * ¿Esta lectura de la asistencia sirve para liquidar?
 *
 * Sin horas PROGRAMADAS no hay jornada contra la cual medir, así que la
 * lectura devuelve ceros — y un cero acá no significa "no trabajó", significa
 * "no se sabe". Pasan dos cosas distintas por este camino y las dos terminan
 * igual: al empleado nunca se le armó el horario, o quien mira la planilla no
 * tiene permiso para ver la asistencia (RLS filtra las filas en silencio, no
 * da error, así que la consulta "funciona" y devuelve vacío).
 *
 * Tratar ese cero como un dato era lo peor de los dos mundos: ponía a todo el
 * mundo en 0 h, bloqueaba los pagos diciendo que las marcas decían 0, y
 * ofrecía un botón "traer 0 h" que borraba las horas buenas.
 */
export function lecturaUtilizable(
  totales:
    | {
        horasEsperadas: number
        horasOrdinarias?: number
        horasExtra?: number
        periodoCubiertoPorAusencias?: boolean
      }
    | null
    | undefined
): boolean {
  if (!totales) return false
  // Una quincena entera de vacaciones, feriados o incapacidad no tiene horas
  // esperadas y SÍ es una lectura: dice exactamente qué pagar. Antes caía al
  // supuesto de jornada completa, que pagaba el salario entero también en
  // una quincena completa de permiso sin goce o de incapacidad.
  //
  // Tiene que ser la quincena ENTERA. Con que haya un solo día sin cubrir, un
  // periodo sin horas esperadas es un horario que no se cargó: alguien sin
  // programación que marcó 14 días y tuvo un día de vacaciones no "trabajó
  // un día", y leerlo así lo dejaba con un 7 % del salario.
  const hayJornada = totales.horasEsperadas > 0 || totales.periodoCubiertoPorAusencias === true
  if (!hayJornada) return false

  // Cinturón y tirantes: un NaN colado —una marca ilegible, por ejemplo— nunca
  // debe llegar a guardarse como las horas de alguien.
  return Number.isFinite(totales.horasOrdinarias ?? 0) && Number.isFinite(totales.horasExtra ?? 0)
}

/** Suma los días de la quincena de un empleado. */
export function calcularHorasPeriodo(dias: DiaProgramado[]): TotalesPeriodo {
  const calculados = dias.map(calcularDia)

  const acumular = (
    campo:
      | 'horasEsperadas'
      | 'horasOrdinarias'
      | 'horasExtra'
      | 'horasAcreditadas'
      | 'diaAcreditadoSinHorario'
      | 'horasProgramadasDia'
      | 'diaJustificadoSinHorario'
      | 'diaSinProgramar'
  ) => round2(calculados.reduce((suma, d) => suma + d[campo], 0))

  const conProblema = calculados
    .filter((d): d is DiaCalculado & { problema: ProblemaDia } => d.problema !== null)
    .map((d) => ({ fecha: d.fecha, problema: d.problema }))

  return {
    horasEsperadas: acumular('horasEsperadas'),
    horasOrdinarias: acumular('horasOrdinarias'),
    horasExtra: acumular('horasExtra'),
    horasAcreditadas: acumular('horasAcreditadas'),
    diasAcreditadosSinHorario: acumular('diaAcreditadoSinHorario'),
    diasJustificados: calculados.filter((d) => d.justificacion && !d.justificacion.esIntradia)
      .length,
    // Hace falta al menos un día justificado: una quincena entera de días
    // libres no es "cubierta por ausencias", es una programación que no sirve,
    // y dejarla pasar pagaba ₡0 sin trabar el pago.
    periodoCubiertoPorAusencias:
      calculados.some((d) => d.justificacion !== null && !d.justificacion.esIntradia) &&
      calculados.every(
        (d, i) => dias[i].esDiaLibre || (d.justificacion !== null && !d.justificacion.esIntradia)
      ),
    horasProgramadasTotales: acumular('horasProgramadasDia'),
    diasJustificadosSinHorario: acumular('diaJustificadoSinHorario'),
    diasSinProgramar: acumular('diaSinProgramar'),
    diasConProblema: conProblema,
    diasQueBloquean: conProblema.filter((d) => PROBLEMAS_QUE_BLOQUEAN.has(d.problema)),
    dias: calculados,
  }
}
