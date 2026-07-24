/**
 * Cálculo de aguinaldo y liquidación (finiquito) según el Código de Trabajo
 * de Costa Rica.
 *
 * Fuentes: Artículo 29 CT (auxilio de cesantía), Artículo 28 CT (preaviso),
 * Ley N.° 2412 (aguinaldo). Estas tablas se tomaron de guías legales
 * especializadas (no del texto oficial de la Gaceta, al que no se pudo
 * acceder directamente) — antes de usarlas para pagar liquidaciones reales,
 * confirmalas con un contador o abogado laboral. Un error acá es dinero mal
 * pagado a una persona real.
 */

/**
 * Días de cesantía que se ganan por cada año COMPLETO trabajado, según el
 * Art. 29 CT. El índice 0 es el año 1, el índice 7 es el año 8 (tope legal:
 * no se reconocen más de 8 años aunque la persona lleve más antigüedad).
 */
export const DIAS_CESANTIA_POR_ANIO = [19.5, 20, 20.5, 21, 21.24, 21.5, 22, 22] as const

export const TOPE_ANIOS_CESANTIA = 8

/**
 * Meses completos de antigüedad entre dos fechas (redondeado hacia abajo,
 * sin contar el día en curso si aún no se cumple el aniversario mensual).
 */
export function calcularMesesAntiguedad(fechaIngreso: Date, fechaSalida: Date): number {
  let meses =
    (fechaSalida.getFullYear() - fechaIngreso.getFullYear()) * 12 +
    (fechaSalida.getMonth() - fechaIngreso.getMonth())
  if (fechaSalida.getDate() < fechaIngreso.getDate()) {
    meses -= 1
  }
  return Math.max(meses, 0)
}

/**
 * Días de cesantía acumulados según los meses totales de antigüedad.
 * - Menos de 3 meses: no genera cesantía (0 días).
 * - De 3 a 6 meses: 7 días fijos.
 * - De 6 meses a 1 año: 14 días fijos.
 * - De ahí en adelante: se suman los días de cada año completo según la
 *   escala del Art. 29, con tope de 8 años. Si el último año no se completó
 *   pero pasa de 6 meses, cuenta como año completo (regla legal de
 *   "fracción superior a seis meses").
 */
export function calcularDiasCesantia(mesesAntiguedad: number): number {
  if (mesesAntiguedad < 3) return 0
  if (mesesAntiguedad < 6) return 7
  if (mesesAntiguedad < 12) return 14

  let anios = Math.floor(mesesAntiguedad / 12)
  const mesesResto = mesesAntiguedad % 12
  if (mesesResto > 6) {
    anios += 1
  }
  anios = Math.min(anios, TOPE_ANIOS_CESANTIA)

  let dias = 0
  for (let i = 0; i < anios; i++) {
    dias += DIAS_CESANTIA_POR_ANIO[i]
  }
  return dias
}

/**
 * Días de preaviso según el Art. 28 CT. Aplica igual para despido sin justa
 * causa y para renuncia (es una obligación de ambas partes), aunque en este
 * sistema solo se usa del lado del pago al empleado.
 */
export function calcularDiasPreaviso(mesesAntiguedad: number): number {
  if (mesesAntiguedad < 3) return 0
  if (mesesAntiguedad < 6) return 7
  if (mesesAntiguedad < 12) return 15
  return 30
}

export interface LiquidacionInput {
  /** Salario diario a usar en todos los rubros (normalmente el promedio bruto de los últimos 6 meses ÷ 30). */
  salarioDiario: number
  /** Días trabajados en el mes en que sale, para el salario proporcional. */
  diasTrabajadosMesActual: number
  /** Suma de salarios brutos devengados desde el 1° de diciembre anterior hasta la fecha de salida. */
  sumaSalariosBrutosCicloAguinaldo: number
  /** Días de vacaciones pendientes de disfrutar (ingresado manualmente: el sistema aún no lleva el control de vacaciones). */
  diasVacacionesPendientes: number
  /** Meses completos de antigüedad (usar calcularMesesAntiguedad). */
  mesesAntiguedad: number
  /** Del catálogo de motivos de salida (mot_genera_cesantia). */
  generaCesantia: boolean
  /** Del catálogo de motivos de salida (mot_genera_preaviso). */
  generaPreaviso: boolean
}

export interface LiquidacionLinea {
  concepto: string
  dias: number | null
  monto: number
}

export interface LiquidacionResultado {
  salarioProporcional: number
  aguinaldoProporcional: number
  vacacionesPagadas: number
  diasPreaviso: number
  preaviso: number
  diasCesantia: number
  cesantia: number
  total: number
  lineas: LiquidacionLinea[]
}

export function calcularLiquidacion(input: LiquidacionInput): LiquidacionResultado {
  const salarioProporcional = input.salarioDiario * input.diasTrabajadosMesActual
  const aguinaldoProporcional = input.sumaSalariosBrutosCicloAguinaldo / 12
  const vacacionesPagadas = input.salarioDiario * input.diasVacacionesPendientes

  const diasPreaviso = input.generaPreaviso ? calcularDiasPreaviso(input.mesesAntiguedad) : 0
  const preaviso = input.salarioDiario * diasPreaviso

  const diasCesantia = input.generaCesantia ? calcularDiasCesantia(input.mesesAntiguedad) : 0
  const cesantia = input.salarioDiario * diasCesantia

  const total =
    salarioProporcional + aguinaldoProporcional + vacacionesPagadas + preaviso + cesantia

  return {
    salarioProporcional,
    aguinaldoProporcional,
    vacacionesPagadas,
    diasPreaviso,
    preaviso,
    diasCesantia,
    cesantia,
    total,
    lineas: [
      {
        concepto: 'Salario proporcional',
        dias: input.diasTrabajadosMesActual,
        monto: salarioProporcional,
      },
      { concepto: 'Aguinaldo proporcional', dias: null, monto: aguinaldoProporcional },
      {
        concepto: 'Vacaciones no disfrutadas',
        dias: input.diasVacacionesPendientes,
        monto: vacacionesPagadas,
      },
      { concepto: 'Preaviso', dias: diasPreaviso, monto: preaviso },
      { concepto: 'Cesantía', dias: diasCesantia, monto: cesantia },
    ],
  }
}

/**
 * Aguinaldo "normal" de fin de año: salarios brutos devengados de diciembre
 * (año anterior) a noviembre (año en curso), entre 12. En este sistema se
 * acumula período a período en
 * sgrh_provisiones_anuales.pra_monto_acumulado_aguinaldo cada vez que se
 * marca un pago como pagado, así que al cerrar el ciclo esa columna ya
 * contiene el resultado de esta fórmula.
 */
export function calcularAguinaldo(sumaSalariosBrutosCicloAguinaldo: number): number {
  return sumaSalariosBrutosCicloAguinaldo / 12
}

/**
 * Año del ciclo de aguinaldo (diciembre-noviembre) al que pertenece un
 * periodo de planilla. Diciembre "abre" el ciclo del año siguiente.
 */
export function anioCicloAguinaldo(mesPeriodo: number, anioPeriodo: number): number {
  return mesPeriodo === 12 ? anioPeriodo + 1 : anioPeriodo
}
