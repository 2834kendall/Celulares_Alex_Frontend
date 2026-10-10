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
import { ultimoDiaDelMes } from '@/modules/payroll/lib/fechas'

/**
 * Código del motivo "Mutuo Acuerdo entre las Partes" en
 * sgrh_cat_motivos_salida. El Art. 86 CT lo pone entre las causas que
 * terminan el contrato sin responsabilidad para ninguna de las partes: no
 * hay preaviso ni cesantía que la ley obligue a pagar, pero las partes pueden
 * pactarla. Por eso la cesantía de este motivo no sale del catálogo: la
 * indica quien liquida (ProcesarLiquidacionInput.cesantiaPactada).
 */
export const MOTIVO_MUTUO_ACUERDO = 'MUT001'

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

/**
 * Tipos de contrato a los que aplica el Art. 31 CT ("contrato a plazo fijo
 * y para obra determinada"). Códigos de sgrh_cat_tipos_contrato.
 */
export const TIPOS_CONTRATO_ART_31 = new Set(['PLAZO_FIJO', 'OBRA_DET'])

const MS_POR_DIA = 24 * 60 * 60 * 1000

function fechaUtc(fecha: string): number {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number)
  return Date.UTC(anio, mes - 1, dia)
}

/**
 * Días de salario de la indemnización del Art. 31 CT cuando el patrono rompe
 * sin justa causa un contrato a plazo fijo o por obra determinada antes de
 * que termine (texto vigente, reformado por la Ley 7983 del 16/2/2000):
 *
 *   "un día de salario por cada siete días de trabajo continuo ejecutado o
 *   fracción de tiempo menor, si no se hubiera ajustado dicho término"; "en
 *   ningún caso esta suma podrá ser inferior a tres días de salario"; y si el
 *   contrato "se ha estipulado por seis meses o más", nunca inferior a
 *   veintidós días de salario.
 *
 * La "fracción de tiempo menor" cuenta como un día más (redondeo hacia
 * arriba). La ley no fija tope. Aparte, el trabajador puede reclamar los
 * daños y perjuicios que demuestre; eso lo fija un juez y no se calcula acá.
 */
export function calcularDiasIndemnizacionPlazoFijo(
  diasTrabajados: number,
  seisMesesOMas: boolean
): number {
  const porSemanas = Math.ceil(Math.max(diasTrabajados, 0) / 7)
  return Math.max(porSemanas, 3, seisMesesOMas ? 22 : 0)
}

/**
 * Por qué el preaviso o la cesantía quedaron en 0 días, para decirlo en el
 * desglose y en el comprobante: un "Preaviso (0 días)" sin explicación
 * parece un error (auditoría 2, hallazgo 10). null si tiene días.
 */
export function notaRubroSinDias(input: {
  rubro: 'preaviso' | 'cesantia'
  dias: number
  /** Se pagó la indemnización del Art. 31 en su lugar. */
  plazoFijo: boolean
  /** El motivo de salida genera este rubro (mot_genera_preaviso / _cesantia). */
  generaPorMotivo: boolean
  motivoNombre: string
  /** Mutuo acuerdo en que quien liquidó indicó que no se pactó cesantía. */
  mutuoAcuerdoSinCesantia?: boolean
}): string | null {
  if (input.dias > 0) return null
  if (input.plazoFijo) {
    return 'no aplica a un contrato a plazo fijo terminado por el patrono: se paga la indemnización del Art. 31'
  }
  if (input.rubro === 'cesantia' && input.mutuoAcuerdoSinCesantia) {
    return 'mutuo acuerdo sin cesantía pactada (Art. 86)'
  }
  if (!input.generaPorMotivo) {
    return `no aplica por el motivo de salida (${input.motivoNombre})`
  }
  return 'menos de 3 meses de antigüedad (Arts. 28 y 29)'
}

/** Días calendario de `inicio` a `fin`, contando los dos. */
export function diasCalendarioInclusive(inicio: string, fin: string): number {
  return Math.round((fechaUtc(fin) - fechaUtc(inicio)) / MS_POR_DIA) + 1
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
  salarioMensualContrato: number,
  /**
   * Qué parte de una quincena completa trabajó en cada una (1 = completa).
   * Una quincena de ingreso o de salida es parcial: contarla como completa
   * bajaba el promedio (auditoría 2, fallo 3: un solo día de julio contaba
   * como media mensualidad y el diario salía 23 % más bajo).
   */
  pesos?: readonly number[]
): SalarioDiarioResultado {
  const quincenas = brutosQuincenasPagadas
    .map((bruto, i) => ({ bruto, peso: pesos?.[i] ?? 1 }))
    .filter((q) => Number.isFinite(q.bruto) && q.bruto > 0 && q.peso > 0)

  // No se redondea: el diario se multiplica hasta por 172 días de cesantía y
  // dos centavos de redondeo se vuelven medio colón. Se redondea cada rubro.
  if (quincenas.length < 2) {
    return { salarioDiario: salarioMensualContrato / 30, origen: 'contrato' }
  }

  const suma = quincenas.reduce((acc, q) => acc + q.bruto, 0)
  const meses = quincenas.reduce((acc, q) => acc + Math.min(q.peso, 1), 0) / 2
  return { salarioDiario: suma / meses / 30, origen: 'promedio' }
}

/**
 * Día de salida en mes comercial de 30 días, que es como paga la planilla
 * (cada quincena vale medio salario, tenga el mes 28 o 31 días).
 *
 *  - El último día del mes cuenta como 30: salir el 28 de febrero es salir a
 *    fin de mes. Antes contaba 28, y con la 1ª quincena pagada salían 13 días
 *    de salario pendiente cuando la planilla paga 15 por esa quincena.
 *  - El 31 también cuenta como 30 (ya era así).
 */
export function diaComercialDeSalida(fechaSalida: string): number {
  const [anio, mes, dia] = fechaSalida.split('-').map(Number)
  if (dia >= ultimoDiaDelMes(mes, anio)) return 30
  return Math.min(dia, 30)
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

/**
 * ¿Esta quincena ya se pagó dentro de una liquidación, como salario
 * pendiente? Se deduce de los días guardados (ver diasSalarioPendiente):
 *
 *  - salida del 1 al 15: la 1ª quincena del mes;
 *  - salida del 16 en adelante: la 2ª, y la 1ª solo si tampoco estaba pagada
 *    al liquidar (el pendiente arrancó el día 1: días > día de salida − 15).
 *
 * Una 1ª quincena que ya estaba pagada no cuenta aunque después la
 * desmarquen: si no, no se podía volver a marcar y esos días quedaban sin
 * pagar por ningún lado.
 */
export function quincenaPagadaEnLiquidacion(
  liquidacion: { fechaSalida: string; diasSalarioPendiente: number },
  quincena: { anio: number; mes: number; quincena: number }
): boolean {
  const dias = liquidacion.diasSalarioPendiente
  if (!(dias > 0)) return false
  const [anio, mes] = liquidacion.fechaSalida.split('-').map(Number)
  if (quincena.anio !== anio || quincena.mes !== mes) return false
  // Mismo día comercial con que se calcularon los días (diaComercialDeSalida).
  // Una liquidación guardada con la regla anterior también calza: salida el
  // 28 de febrero con la 1ª pagada guardó 13 días, y 13 > 15 es falso igual.
  const diaSalida = diaComercialDeSalida(liquidacion.fechaSalida)
  if (diaSalida <= 15) return quincena.quincena === 1
  if (quincena.quincena === 2) return true
  return dias > diaSalida - 15
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
  /**
   * Días de vacaciones pendientes de disfrutar. El sistema los propone (ver
   * derechos.ts: proponerVacaciones) y quien liquida los puede corregir.
   */
  diasVacacionesPendientes: number
  /**
   * Salario diario para las vacaciones: promedio de "la última cincuentena"
   * (Art. 157 CT), no de los seis meses del Art. 30. Si no viene, se usa
   * salarioDiario (como antes).
   */
  salarioDiarioVacaciones?: number
  /**
   * false = no tiene el mes continuo que exige el aguinaldo (ver derechos.ts:
   * cumpleMesMinimoAguinaldo). Si no viene, se paga (como antes).
   */
  aguinaldoAplica?: boolean
  /** Meses completos de antigüedad (ver calcularAntiguedad). */
  mesesAntiguedad: number
  /** Días sueltos después del último mes completo (ver calcularAntiguedad). */
  diasSobrantesAntiguedad?: number
  /** Del catálogo de motivos de salida (mot_genera_cesantia). */
  generaCesantia: boolean
  /** Del catálogo de motivos de salida (mot_genera_preaviso). */
  generaPreaviso: boolean
  /**
   * Contrato a plazo fijo (u obra determinada) que el patrono rompió sin justa
   * causa antes del plazo: en vez de preaviso y cesantía se paga la
   * indemnización del Art. 31 CT (ver calcularDiasIndemnizacionPlazoFijo).
   * Quien llama decide si aplica; acá solo se calcula.
   */
  plazoFijo?: { diasTrabajados: number; seisMesesOMas: boolean } | null
  /**
   * Suma de los porcentajes de deducción obrera del catálogo (CCSS obrera y
   * cualquier otra "porcentaje del bruto"). Se aplica solo a lo que es
   * salario: el pendiente y las vacaciones. Cero si no se quiere deducir.
   */
  porcentajeDeduccionObrera?: number
  /**
   * Horas extra que seguían pendientes en el banco de horas al salir (ni
   * pagadas ni compensadas). Se pagan en el finiquito: son salario, así que
   * cotizan y entran al aguinaldo proporcional. Sin esto quedaban pendientes
   * para siempre, porque ya no hay quincena donde pagarlas (auditoría,
   * hallazgo 4).
   */
  horasExtraBanco?: { horas: number; monto: number }
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
  /** Horas extra pendientes del banco de horas, pagadas en el finiquito. */
  horasExtraBanco: number
  diasPreaviso: number
  preaviso: number
  diasCesantia: number
  cesantia: number
  /** Indemnización del Art. 31 CT (contrato a plazo fijo roto sin justa causa). */
  diasIndemnizacionPlazoFijo: number
  indemnizacionPlazoFijo: number
  /** Suma bruta de todos los rubros. */
  total: number
  /** Cuota obrera sobre lo que es salario (pendiente, vacaciones y horas extra). */
  deduccionesObreras: number
  /** total − deduccionesObreras: lo que recibe la persona. */
  neto: number
  lineas: LiquidacionLinea[]
}

/**
 * Arma el finiquito.
 *
 * Qué cotiza y qué no, porque cambia el neto:
 *  - Salario pendiente, vacaciones pagadas en dinero y horas extra
 *    pendientes del banco de horas SON salario: llevan cuota obrera de la
 *    CCSS igual que una quincena, y entran al aguinaldo proporcional.
 *  - Preaviso, cesantía y la indemnización del Art. 31 (plazo fijo) son
 *    indemnizaciones, no salario: no cotizan ni pagan renta.
 *
 * En un contrato a plazo fijo roto por el patrono antes del plazo no hay
 * preaviso ni cesantía (son del contrato por tiempo indefinido, Arts. 28 y
 * 29): se paga la indemnización del Art. 31.
 *  - El aguinaldo está exento por su propia ley.
 *
 * El aguinaldo proporcional incluye el salario pendiente de este mismo
 * finiquito: se devengó dentro del ciclo, aunque se pague acá y no por
 * planilla.
 */
export function calcularLiquidacion(input: LiquidacionInput): LiquidacionResultado {
  const diasSobrantes = input.diasSobrantesAntiguedad ?? 0

  const salarioProporcional = round2(input.salarioDiario * input.diasTrabajadosMesActual)
  const horasExtraBanco = round2(Math.max(input.horasExtraBanco?.monto ?? 0, 0))
  const aguinaldoProporcional =
    input.aguinaldoAplica === false
      ? 0
      : round2(
          (input.sumaSalariosBrutosCicloAguinaldo + salarioProporcional + horasExtraBanco) / 12
        )
  const vacacionesPagadas = round2(
    (input.salarioDiarioVacaciones ?? input.salarioDiario) * input.diasVacacionesPendientes
  )

  const plazoFijo = input.plazoFijo ?? null

  const diasPreaviso =
    input.generaPreaviso && !plazoFijo
      ? calcularDiasPreaviso(input.mesesAntiguedad, diasSobrantes)
      : 0
  const preaviso = round2(input.salarioDiario * diasPreaviso)

  const diasCesantia =
    input.generaCesantia && !plazoFijo
      ? calcularDiasCesantia(input.mesesAntiguedad, diasSobrantes)
      : 0
  const cesantia = round2(input.salarioDiario * diasCesantia)

  const diasIndemnizacionPlazoFijo = plazoFijo
    ? calcularDiasIndemnizacionPlazoFijo(plazoFijo.diasTrabajados, plazoFijo.seisMesesOMas)
    : 0
  const indemnizacionPlazoFijo = round2(input.salarioDiario * diasIndemnizacionPlazoFijo)

  const total = round2(
    salarioProporcional +
      aguinaldoProporcional +
      vacacionesPagadas +
      horasExtraBanco +
      preaviso +
      cesantia +
      indemnizacionPlazoFijo
  )

  const porcentaje = input.porcentajeDeduccionObrera ?? 0
  const deduccionesObreras = round2(
    (salarioProporcional + vacacionesPagadas + horasExtraBanco) * (Math.max(porcentaje, 0) / 100)
  )
  const neto = round2(total - deduccionesObreras)

  return {
    salarioProporcional,
    aguinaldoProporcional,
    vacacionesPagadas,
    horasExtraBanco,
    diasPreaviso,
    preaviso,
    diasCesantia,
    cesantia,
    diasIndemnizacionPlazoFijo,
    indemnizacionPlazoFijo,
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
      ...(horasExtraBanco > 0
        ? [
            {
              concepto: `Horas extra pendientes del banco de horas (${input.horasExtraBanco?.horas ?? 0} h)`,
              dias: null,
              monto: horasExtraBanco,
            },
          ]
        : []),
      { concepto: 'Preaviso', dias: diasPreaviso, monto: preaviso },
      { concepto: 'Cesantía', dias: diasCesantia, monto: cesantia },
      ...(plazoFijo
        ? [
            {
              concepto: 'Indemnización por contrato a plazo fijo (Art. 31)',
              dias: diasIndemnizacionPlazoFijo,
              monto: indemnizacionPlazoFijo,
            },
          ]
        : []),
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
