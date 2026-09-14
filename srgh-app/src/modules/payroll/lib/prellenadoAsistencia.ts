/**
 * Cómo se traduce la asistencia de una quincena en una fila de planilla.
 *
 * Es la regla que usaban la plantilla de Excel y nada más. Ahora la comparte
 * con "cargar empleados desde asistencia", que arma las mismas filas sin pasar
 * por el archivo: si cada uno tuviera su propia cuenta, cargar por un camino o
 * por el otro daría montos distintos para la misma quincena.
 */

import { lecturaUtilizable, salarioPorHoraPeriodo } from '@/modules/payroll/lib/horasPeriodo'
import { TOPE_HORAS_NORMALES_QUINCENAL } from '@/modules/payroll/lib/planilla'
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
 * Sin lectura de marcas (`totales` en null) se cae al supuesto anterior:
 * jornada completa de la quincena y salario base entero.
 *
 * El BASE se prorratea sobre salario_base / 2 y NO multiplicando las horas por
 * el valor de la hora: ese valor va redondeado a dos decimales, y multiplicarlo
 * por 88 horas dejaba a quien cumplió su jornada completa cobrando ¢299.999,92
 * en vez de ¢300.000. La hora redondeada sirve para las horas extra; el base
 * sale de la proporción.
 *
 * Trabajar de más no infla el base: la proporción se recorta a 1 y esas horas
 * se pagan aparte como extra (banco de horas).
 */
export function prellenarDesdeAsistencia(
  salarioBaseMensual: number,
  totales: HorasDeAsistencia | null
): FilaPrellenada {
  const mitadMensual = salarioBaseMensual / 2

  // Sin horas programadas la lectura devuelve ceros, y eso NO es "trabajó 0
  // horas": es que no hay con qué medir (ver lecturaUtilizable). Antes se
  // guardaban esos ceros junto con el salario completo, o sea una fila que
  // decía "0 h trabajadas, ₡300 000 a pagar".
  if (!lecturaUtilizable(totales)) {
    return {
      horas: TOPE_HORAS_NORMALES_QUINCENAL,
      horasExtra: 0,
      salarioPorHora: round2(mitadMensual / TOPE_HORAS_NORMALES_QUINCENAL),
      base: round2(mitadMensual),
      desdeAsistencia: false,
    }
  }

  const leidas = totales!
  const proporcion = Math.min(leidas.horasOrdinarias, leidas.horasEsperadas) / leidas.horasEsperadas

  return {
    horas: leidas.horasOrdinarias,
    horasExtra: leidas.horasExtra,
    salarioPorHora: salarioPorHoraPeriodo(salarioBaseMensual, leidas.horasEsperadas),
    base: round2(mitadMensual * proporcion),
    desdeAsistencia: true,
  }
}
