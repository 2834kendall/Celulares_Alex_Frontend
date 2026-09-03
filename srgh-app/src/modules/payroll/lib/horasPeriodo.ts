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
 *  - El salario base pactado corresponde a la jornada completa de la quincena.
 *    Si la persona trabajó menos horas de las que tenía programadas, cobra
 *    proporcionalmente menos; el prorrateo sale de `salarioPorHoraPeriodo`.
 *  - La hora de almuerzo no se paga: se resta siempre, igual que en la
 *    pantalla de horarios.
 *  - Es hora extra lo que pasa de las horas PROGRAMADAS de ese día, no de un
 *    número fijo. Así, quien tiene pactada una jornada de 12 h no genera extra
 *    por trabajar 12 h — y quien tiene 8 sí la genera a la novena.
 *  - Un día cubierto por una ausencia aprobada, un feriado, un día libre o un
 *    día sin programación NO cuenta: ni suma horas esperadas ni las rebaja.
 *    Rebajarle el sueldo a alguien por una incapacidad aprobada sería
 *    exactamente lo contrario de lo que corresponde; esos días se pagan por su
 *    propio camino (ver registrarIncapacidad y el catálogo de ausencias).
 *  - Un día programado con marcas incompletas no se "adivina": se reporta como
 *    problema y bloquea el pago hasta que alguien corrija la marca.
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
  /** Marcas de ESE empleado en ESE día (filtrar es responsabilidad de quien llama). */
  marcas: RawMark[]
}

/** Por qué un día programado no se puede liquidar solo. */
export type ProblemaDia = 'sin_marcas' | 'sin_entrada' | 'sin_salida'

export const MENSAJE_PROBLEMA: Record<ProblemaDia, string> = {
  sin_marcas: 'No se registró ninguna marca ese día.',
  sin_entrada: 'Hay marca de salida pero no de entrada.',
  sin_salida: 'Hay marca de entrada pero no de salida.',
}

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
}

/** 'HH:mm' o 'HH:mm:ss' → minutos desde medianoche. */
function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/** 'YYYY-MM-DD HH:mm:ss' → minutos desde la medianoche de `fechaBase`. */
function minutosDesde(fechaBase: string, marca: string): number {
  const [fecha, hora = '00:00:00'] = marca.split(' ')
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
function minutosDescontables(horario: HorarioDia, entrada: number, salida: number): number {
  const anclaje = minutosDeHora(horario.entrada)
  const ventana = (inicio: string | null, fin: string | null) =>
    inicio && fin
      ? solape(entrada, salida, minutosEnJornada(inicio, anclaje), minutosEnJornada(fin, anclaje))
      : 0

  const almuerzo = ventana(horario.inicioAlmuerzo, horario.finAlmuerzo)
  const brk = ventana(horario.inicioBreak, horario.finBreak)

  return almuerzo + Math.max(0, brk - PAID_BREAK_MINUTES)
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

const DIA_VACIO = (fecha: string, problema: ProblemaDia | null, horasEsperadas: number) => ({
  fecha,
  horasEsperadas,
  horasTrabajadas: 0,
  horasOrdinarias: 0,
  horasExtra: 0,
  problema,
  cuenta: horasEsperadas > 0,
})

/** Calcula un día: cuántas horas tenía que trabajar, cuántas trabajó, y qué falta. */
export function calcularDia(dia: DiaProgramado): DiaCalculado {
  // Días que no cuentan: sin programación, libre, feriado o con ausencia
  // aprobada. No suman horas esperadas, así que tampoco rebajan el salario.
  if (!dia.horario || dia.esDiaLibre || dia.esFeriado || dia.tieneAusenciaAprobada) {
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

  // Turno que cruza medianoche: si la salida quedó antes que la entrada, cayó
  // en el día siguiente. Las ventanas de almuerzo y break del horario se
  // anclan siempre al día en que ARRANCA la jornada.
  const salidaReal = salida < entrada ? salida + MINUTOS_POR_DIA : salida

  const brutos = salidaReal - entrada
  const netos = Math.max(0, brutos - minutosDescontables(horario, entrada, salidaReal))

  const horasTrabajadas = round2(netos / 60)
  const horasOrdinarias = round2(Math.min(horasTrabajadas, horasEsperadas))
  const horasExtra = round2(Math.max(0, horasTrabajadas - horasEsperadas))

  return {
    fecha: dia.fecha,
    horasEsperadas,
    horasTrabajadas,
    horasOrdinarias,
    horasExtra,
    problema: null,
    cuenta: true,
  }
}

export interface TotalesPeriodo {
  /** Horas que la persona tenía programadas en toda la quincena. */
  horasEsperadas: number
  /** Horas trabajadas dentro de la jornada programada — las que pagan el base. */
  horasOrdinarias: number
  /** Horas por encima de la jornada de cada día. Van al banco de horas. */
  horasExtra: number
  /** Días programados con marcas incompletas. Bloquean el pago. */
  diasConProblema: { fecha: string; problema: ProblemaDia }[]
  dias: DiaCalculado[]
}

/** Suma los días de la quincena de un empleado. */
export function calcularHorasPeriodo(dias: DiaProgramado[]): TotalesPeriodo {
  const calculados = dias.map(calcularDia)

  const acumular = (campo: 'horasEsperadas' | 'horasOrdinarias' | 'horasExtra') =>
    round2(calculados.reduce((suma, d) => suma + d[campo], 0))

  return {
    horasEsperadas: acumular('horasEsperadas'),
    horasOrdinarias: acumular('horasOrdinarias'),
    horasExtra: acumular('horasExtra'),
    diasConProblema: calculados
      .filter((d): d is DiaCalculado & { problema: ProblemaDia } => d.problema !== null)
      .map((d) => ({ fecha: d.fecha, problema: d.problema })),
    dias: calculados,
  }
}

/**
 * Salario por hora de la quincena: el base pactado del contrato, prorrateado
 * sobre las horas que la persona TENÍA programadas en ese periodo.
 *
 * Así, quien cumple su jornada completa cobra exactamente salario_base ÷ 2, y
 * quien trabajó de menos cobra en proporción. El divisor sale de la
 * programación real y no de una constante: una quincena con un feriado tiene
 * menos horas esperadas, y el valor de la hora sube en consecuencia en vez de
 * castigar a la persona.
 */
export function salarioPorHoraPeriodo(salarioBaseMensual: number, horasEsperadas: number): number {
  if (horasEsperadas <= 0) return 0
  return round2(salarioBaseMensual / 2 / horasEsperadas)
}
