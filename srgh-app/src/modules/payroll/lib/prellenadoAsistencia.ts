/**
 * Cómo se traduce la asistencia de una quincena en una fila de planilla.
 *
 * Es la regla que usaban la plantilla de Excel y nada más. Ahora la comparte
 * con "cargar empleados desde asistencia", que arma las mismas filas sin pasar
 * por el archivo: si cada uno tuviera su propia cuenta, cargar por un camino o
 * por el otro daría montos distintos para la misma quincena.
 *
 * La regla es una sola: el salario del contrato paga la jornada del contrato.
 * Salario ÷ 2 es lo que vale la quincena completa —96 h en una jornada diurna
 * de 48 h semanales (ver lib/jornada.ts)— y cada hora ordinaria vale esa
 * quincena entre esas horas. Quien trabaja 9 h cobra 9 de esas 96; quien
 * trabaja las 96, la quincena entera; quien trabaja más, la quincena entera y
 * el resto por el banco de horas.
 *
 * Lo que se lee de las marcas dice cuántas horas trabajó. NO dice cuánto vale
 * la quincena: eso lo dice el contrato. Dos bugs salieron de mezclar las dos
 * cosas, y los dos con el mismo dato: una quincena con un solo día de 9 h
 * programado.
 *
 *  - El valor hora salía de salario ÷ 2 ÷ horas programadas: ₡26.111 en vez
 *    de ₡2.447. Como la hora extra se paga sobre ese número, el banco de
 *    horas sugería diez veces de más.
 *  - El base salía de "trabajó todo lo programado, entonces le toca todo":
 *    9 h trabajadas de 9 programadas → ₡235.000, la quincena completa por un
 *    día de trabajo. Esa proporción medía contra el horario cargado, y un
 *    horario a medio cargar no es una jornada corta: es un dato incompleto.
 *
 * Las horas programadas siguen sirviendo para lo suyo: decidir, día por día,
 * cuáles horas son ordinarias y cuáles extra (lib/horasPeriodo.ts).
 */

import { lecturaUtilizable } from '@/modules/payroll/lib/horasPeriodo'
import { horasJornadaQuincena, valorHoraOrdinaria } from '@/modules/payroll/lib/jornada'
import { round2 } from '@/modules/payroll/lib/numeros'

/** Lo que dicen las marcas de una quincena, reducido a lo que la planilla usa. */
export interface HorasDeAsistencia {
  horasEsperadas: number
  horasOrdinarias: number
  horasExtra: number
}

export interface FilaPrellenada {
  horas: number
  horasExtra: number
  /** Valor de una hora ordinaria, según el contrato. */
  salarioPorHora: number
  /** Monto del concepto BASE: el salario de la quincena ya prorrateado. */
  base: number
  /**
   * false = la asistencia no sirvió y esto es el supuesto de jornada completa.
   * Quien llame tiene que avisarlo: es un número inventado, no un dato.
   */
  desdeAsistencia: boolean
}

/**
 * Fila prellenada de un empleado a partir de su asistencia.
 *
 * `horasSemanales` es la jornada pactada del contrato; null cae a la ordinaria
 * diurna (ver lib/jornada.ts).
 *
 * Sin lectura de marcas utilizable se supone la jornada completa de la
 * quincena y el salario entero: es lo que menos daño hace, pero es un supuesto
 * y quien llama tiene que reportarlo (`desdeAsistencia: false`).
 *
 * El BASE se prorratea sobre salario ÷ 2 y NO multiplicando las horas por el
 * valor de la hora: ese valor va redondeado a dos decimales, y multiplicarlo
 * por 96 horas dejaba a quien cumplió su jornada completa cobrando ¢299.999,92
 * en vez de ¢300.000. La hora redondeada sirve para las extra; el base sale de
 * la proporción.
 *
 * Trabajar de más no infla el base: la proporción se recorta a 1 y esas horas
 * se pagan aparte como extra (banco de horas). Si el base subiera, las mismas
 * horas se pagarían dos veces.
 *
 * La proporción es horas ordinarias trabajadas sobre la JORNADA del contrato,
 * no sobre las horas programadas. Un empleado al que se le programó un solo
 * día no tiene una jornada de un día: tiene el horario a medio cargar, y lo
 * que se le paga tiene que salir de lo que de verdad trabajó.
 */
export function prellenarDesdeAsistencia(
  salarioBaseMensual: number,
  totales: HorasDeAsistencia | null,
  horasSemanales: number | null = null
): FilaPrellenada {
  const mitadMensual = salarioBaseMensual / 2
  // Siempre del contrato, tanto si hubo lectura como si no.
  const salarioPorHora = valorHoraOrdinaria(salarioBaseMensual, horasSemanales)

  // Sin horas programadas la lectura devuelve ceros, y eso NO es "trabajó 0
  // horas": es que no hay con qué medir (ver lecturaUtilizable). Antes se
  // guardaban esos ceros junto con el salario completo, o sea una fila que
  // decía "0 h trabajadas, ₡300 000 a pagar".
  if (!lecturaUtilizable(totales)) {
    return {
      horas: horasJornadaQuincena(horasSemanales),
      horasExtra: 0,
      salarioPorHora,
      base: round2(mitadMensual),
      desdeAsistencia: false,
    }
  }

  const leidas = totales!
  const horasJornada = horasJornadaQuincena(horasSemanales)
  const proporcion = Math.min(leidas.horasOrdinarias, horasJornada) / horasJornada

  return {
    horas: leidas.horasOrdinarias,
    horasExtra: leidas.horasExtra,
    salarioPorHora,
    base: round2(mitadMensual * proporcion),
    desdeAsistencia: true,
  }
}
