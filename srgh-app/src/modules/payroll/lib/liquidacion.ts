/**
 * Cálculo de aguinaldo y liquidación (finiquito) según el Código de Trabajo
 * de Costa Rica.
 *
 * Fuentes:
 *  - Art. 28 CT (preaviso), Art. 29 CT reformado por la Ley 7983 (auxilio de
 *    cesantía) y Art. 30 CT (base de cálculo): texto en el Código de Trabajo
 *    publicado por el MTSS.
 *  - Ley 2412 (aguinaldo): un doceavo de los salarios devengados entre el 1
 *    de diciembre y el 30 de noviembre.
 *
 * Un error acá es dinero mal pagado a una persona real. Cada regla lleva su
 * artículo al lado, y donde las fuentes no coinciden queda dicho cuál se
 * siguió y por qué.
 */

import { round2 } from '@/modules/payroll/lib/numeros'

/**
 * Tabla del Art. 29 CT: días de salario por año laborado según la antigüedad
 * total. El índice 0 es "AÑO 1", el 12 es "AÑO 13 y siguientes".
 *
 * La tabla sube hasta los 22 días (años 7 a 9) y después BAJA. No es un error
 * de transcripción: la Ley 7983 la diseñó así al crear el Fondo de
 * Capitalización Laboral. Con el tope de 8 años, alguien con 9 años cobra
 * 22 × 8 = 176 días y alguien con 15 cobra 20 × 8 = 160.
 */
export const DIAS_CESANTIA_POR_ANIO = [
  19.5, // AÑO 1
  20, // AÑO 2
  20.5, // AÑO 3
  21, // AÑO 4
  21.24, // AÑO 5
  21.5, // AÑO 6
  22, // AÑO 7
  22, // AÑO 8
  22, // AÑO 9
  21.5, // AÑO 10
  21, // AÑO 11
  20.5, // AÑO 12
  20, // AÑO 13 y siguientes
] as const

/** Art. 29 inciso d): no se indemnizan más de los últimos ocho años. */
export const TOPE_ANIOS_CESANTIA = 8

/** Antigüedad exacta: meses completos y los días que sobran del último mes. */
export interface Antiguedad {
  meses: number
  diasSobrantes: number
}

/**
 * Meses completos de antigüedad entre dos fechas (sin contar el mes en curso
 * si aún no se cumple el día del aniversario mensual) y los días sueltos que
 * quedan después del último mes completo.
 *
 * Los días sueltos importan para una sola regla: "fracción superior a seis
 * meses" (Art. 29). Seis meses y un día ES superior a seis meses, y con solo
 * meses enteros esa fracción se leía como seis justos y no redondeaba.
 */
export function calcularAntiguedad(fechaIngreso: Date, fechaSalida: Date): Antiguedad {
  if (fechaSalida.getTime() <= fechaIngreso.getTime()) return { meses: 0, diasSobrantes: 0 }

  let meses =
    (fechaSalida.getFullYear() - fechaIngreso.getFullYear()) * 12 +
    (fechaSalida.getMonth() - fechaIngreso.getMonth())
  if (fechaSalida.getDate() < fechaIngreso.getDate()) {
    meses -= 1
  }
  meses = Math.max(meses, 0)

  // Fecha del último aniversario mensual cumplido; lo que sobra son días.
  const ultimoAniversario = new Date(
    fechaIngreso.getFullYear(),
    fechaIngreso.getMonth() + meses,
    fechaIngreso.getDate()
  )
  const diasSobrantes = Math.max(
    0,
    Math.round((fechaSalida.getTime() - ultimoAniversario.getTime()) / 86_400_000)
  )

  return { meses, diasSobrantes }
}

/** Meses completos de antigüedad. Atajo de calcularAntiguedad para quien solo necesita el número. */
export function calcularMesesAntiguedad(fechaIngreso: Date, fechaSalida: Date): number {
  return calcularAntiguedad(fechaIngreso, fechaSalida).meses
}

/**
 * Años que reconoce el Art. 29: los completos, más uno si la fracción final
 * pasa de seis meses. "Superior a seis meses" es estricto: seis meses justos
 * no cuentan; seis meses y un día, sí.
 */
export function aniosReconocidosCesantia(meses: number, diasSobrantes = 0): number {
  const completos = Math.floor(meses / 12)
  const mesesResto = meses % 12
  const fraccionSuperaSeisMeses = mesesResto > 6 || (mesesResto === 6 && diasSobrantes > 0)
  return completos + (fraccionSuperaSeisMeses ? 1 : 0)
}

/**
 * Días de cesantía según la antigüedad (Art. 29 CT).
 *
 *  - Menos de 3 meses: nada.
 *  - De 3 a 6 meses (inclusive): 7 días. Inciso a): "no menor de tres meses
 *    ni mayor de seis".
 *  - Más de 6 meses y menos de 1 año: 14 días. Inciso b).
 *  - Desde 1 año: la tabla. Se toma la fila de la antigüedad reconocida y se
 *    MULTIPLICA por los años reconocidos, con tope de 8 (inciso d).
 *
 * Sobre esa multiplicación. Hay dos lecturas de la tabla circulando:
 *
 *  (1) Fila de la antigüedad total × años reconocidos (máximo 8). Es la que
 *      aplica el Ministerio de Trabajo (su funcionario, citado en prensa:
 *      "esos días se multiplican por el total de años reconocidos") y la que
 *      usan despachos laborales en sus ejemplos publicados: 10 años a
 *      ₡700.000 → 21,5 días × 8 años = 172 días.
 *  (2) Sumar la fila de cada año, una por una (19,5 + 20 + 20,5 …). Aparece
 *      en varias guías comerciales en línea. Para 8 años da 167,74 días en
 *      vez de 176: paga menos, y es la que tenía este código.
 *
 * Se sigue (1): es la lectura de la autoridad que resuelve los reclamos, y
 * "días por año laborado" en cada fila de la ley describe una tarifa, no un
 * sumando. Si el contador de la empresa aplica otra, este es el único lugar
 * que hay que cambiar.
 */
export function calcularDiasCesantia(mesesAntiguedad: number, diasSobrantes = 0): number {
  if (mesesAntiguedad < 3) return 0
  if (mesesAntiguedad < 6 || (mesesAntiguedad === 6 && diasSobrantes === 0)) return 7
  if (mesesAntiguedad < 12) return 14

  const anios = aniosReconocidosCesantia(mesesAntiguedad, diasSobrantes)
  const tarifa = DIAS_CESANTIA_POR_ANIO[Math.min(anios, DIAS_CESANTIA_POR_ANIO.length) - 1]
  return round2(tarifa * Math.min(anios, TOPE_ANIOS_CESANTIA))
}

/**
 * Días de preaviso según el Art. 28 CT: una semana de 3 a 6 meses, quince
 * días de más de 6 meses a un año, un mes desde el año.
 *
 * Al año exacto se da el mes completo. La letra dice "que no sea mayor de un
 * año → quince días", pero el Ministerio lo liquida como un mes y, en la
 * duda, el derecho laboral resuelve a favor de la persona trabajadora.
 */
export function calcularDiasPreaviso(mesesAntiguedad: number, diasSobrantes = 0): number {
  if (mesesAntiguedad < 3) return 0
  if (mesesAntiguedad < 6 || (mesesAntiguedad === 6 && diasSobrantes === 0)) return 7
  if (mesesAntiguedad < 12) return 15
  return 30
}

/** Quincenas que caben en los seis meses del Art. 30. */
export const QUINCENAS_PROMEDIO_LIQUIDACION = 12

export interface SalarioDiarioResultado {
  salarioDiario: number
  /** 'promedio' si salió de los pagos reales; 'contrato' si hubo que suponerlo. */
  origen: 'promedio' | 'contrato'
}

/**
 * Salario diario para todos los rubros: promedio mensual de los últimos seis
 * meses de salarios devengados, entre 30 (Art. 30 CT).
 *
 * Las planillas de este sistema son quincenales, así que "promedio mensual"
 * es la suma de las quincenas pagadas entre la cantidad de MESES que
 * representan (dos quincenas por mes). El error que había acá: se tomaban 6
 * quincenas (tres meses, no seis) y se dividía la quincena entre 30 como si
 * fuera un mes, lo que daba la mitad del salario diario real y pagaba la
 * cesantía y el preaviso a la mitad.
 *
 * Con menos de dos quincenas pagadas no hay promedio que valga: una sola
 * quincena, y encima parcial, daría un salario diario de fantasía. Se cae al
 * salario del contrato y se avisa.
 */
export function calcularSalarioDiario(
  brutosQuincenasPagadas: readonly number[],
  salarioMensualContrato: number
): SalarioDiarioResultado {
  const quincenas = brutosQuincenasPagadas.filter((b) => Number.isFinite(b) && b > 0)

  // No se redondea: el diario se multiplica hasta por 172 días de cesantía y
  // dos centavos de redondeo se vuelven medio colón. Se redondea cada rubro.
  if (quincenas.length < 2) {
    return { salarioDiario: salarioMensualContrato / 30, origen: 'contrato' }
  }

  const suma = quincenas.reduce((acc, b) => acc + b, 0)
  const meses = quincenas.length / 2
  return { salarioDiario: suma / meses / 30, origen: 'promedio' }
}

/**
 * Días del mes de salida que todavía no se le han pagado.
 *
 * La liquidación paga el salario que falta, no el mes entero: si la persona
 * sale el 20 y la primera quincena ya se pagó por planilla, se le deben los
 * días 16 a 20, no del 1 al 20. Antes se pagaba desde el 1 siempre, o sea la
 * primera quincena dos veces para cualquier salida en la segunda mitad del
 * mes.
 */
export function diasSalarioPendiente(input: {
  diaSalida: number
  primeraQuincenaPagada: boolean
  quincenaDeSalidaPagada: boolean
}): number {
  // Si la quincena en la que sale ya se pagó completa, no hay salario pendiente.
  if (input.quincenaDeSalidaPagada) return 0

  const dia = Math.min(Math.max(input.diaSalida, 0), 30)
  if (dia <= 15) return dia
  return input.primeraQuincenaPagada ? dia - 15 : dia
}

export interface LiquidacionInput {
  /** Salario diario a usar en todos los rubros (ver calcularSalarioDiario). */
  salarioDiario: number
  /** Días del mes de salida que faltan por pagar (ver diasSalarioPendiente). */
  diasTrabajadosMesActual: number
  /**
   * Salarios brutos ya pagados por planilla desde el 1° de diciembre anterior.
   * El salario pendiente de este finiquito se suma aparte: también es salario
   * del ciclo.
   */
  sumaSalariosBrutosCicloAguinaldo: number
  /** Días de vacaciones pendientes de disfrutar (ingresado manualmente). */
  diasVacacionesPendientes: number
  /** Meses completos de antigüedad (ver calcularAntiguedad). */
  mesesAntiguedad: number
  /** Días sueltos después del último mes completo (ver calcularAntiguedad). */
  diasSobrantesAntiguedad?: number
  /** Del catálogo de motivos de salida (mot_genera_cesantia). */
  generaCesantia: boolean
  /** Del catálogo de motivos de salida (mot_genera_preaviso). */
  generaPreaviso: boolean
  /**
   * Suma de los porcentajes de deducción obrera del catálogo (CCSS obrera y
   * cualquier otra "porcentaje del bruto"). Se aplica solo a lo que es
   * salario: el pendiente y las vacaciones. Cero si no se quiere deducir.
   */
  porcentajeDeduccionObrera?: number
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
  /** Suma bruta de todos los rubros. */
  total: number
  /** Cuota obrera sobre lo que es salario (pendiente + vacaciones). */
  deduccionesObreras: number
  /** total − deduccionesObreras: lo que recibe la persona. */
  neto: number
  lineas: LiquidacionLinea[]
}

/**
 * Arma el finiquito.
 *
 * Qué cotiza y qué no, porque cambia el neto:
 *  - Salario pendiente y vacaciones pagadas en dinero SON salario: llevan
 *    cuota obrera de la CCSS igual que una quincena.
 *  - Preaviso y cesantía son indemnizaciones, no salario: no cotizan ni
 *    pagan renta.
 *  - El aguinaldo está exento por su propia ley.
 *
 * El aguinaldo proporcional incluye el salario pendiente de este mismo
 * finiquito: se devengó dentro del ciclo, aunque se pague acá y no por
 * planilla.
 */
export function calcularLiquidacion(input: LiquidacionInput): LiquidacionResultado {
  const diasSobrantes = input.diasSobrantesAntiguedad ?? 0

  const salarioProporcional = round2(input.salarioDiario * input.diasTrabajadosMesActual)
  const aguinaldoProporcional = round2(
    (input.sumaSalariosBrutosCicloAguinaldo + salarioProporcional) / 12
  )
  const vacacionesPagadas = round2(input.salarioDiario * input.diasVacacionesPendientes)

  const diasPreaviso = input.generaPreaviso
    ? calcularDiasPreaviso(input.mesesAntiguedad, diasSobrantes)
    : 0
  const preaviso = round2(input.salarioDiario * diasPreaviso)

  const diasCesantia = input.generaCesantia
    ? calcularDiasCesantia(input.mesesAntiguedad, diasSobrantes)
    : 0
  const cesantia = round2(input.salarioDiario * diasCesantia)

  const total = round2(
    salarioProporcional + aguinaldoProporcional + vacacionesPagadas + preaviso + cesantia
  )

  const porcentaje = input.porcentajeDeduccionObrera ?? 0
  const deduccionesObreras = round2(
    (salarioProporcional + vacacionesPagadas) * (Math.max(porcentaje, 0) / 100)
  )
  const neto = round2(total - deduccionesObreras)

  return {
    salarioProporcional,
    aguinaldoProporcional,
    vacacionesPagadas,
    diasPreaviso,
    preaviso,
    diasCesantia,
    cesantia,
    total,
    deduccionesObreras,
    neto,
    lineas: [
      {
        concepto: 'Salario pendiente',
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
  return round2(sumaSalariosBrutosCicloAguinaldo / 12)
}

/**
 * Año del ciclo de aguinaldo (diciembre-noviembre) al que pertenece un
 * periodo de planilla. Diciembre "abre" el ciclo del año siguiente.
 */
export function anioCicloAguinaldo(mesPeriodo: number, anioPeriodo: number): number {
  return mesPeriodo === 12 ? anioPeriodo + 1 : anioPeriodo
}
