/**
 * Lo que la ley cuenta como SALARIO para los derechos laborales (aguinaldo,
 * promedio de la liquidación, vacaciones), a partir de las quincenas pagadas
 * y de las ausencias aprobadas.
 *
 * Tres reglas, cada una con su fuente del MTSS:
 *
 *  - Incapacidad por enfermedad o riesgo del trabajo: NO es salario, es un
 *    subsidio. "No se toma en cuenta el período que la persona trabajadora
 *    estuvo incapacitada … por cuanto no recibió salario sino un 'subsidio'"
 *    (MTSS, El aguinaldo en la empresa privada). En la planilla el subsidio ya
 *    va fuera del salario bruto, así que para el aguinaldo no hay que restar
 *    nada. Para el promedio de la liquidación sí importa: las quincenas con
 *    incapacidad salen del promedio y se toman las anteriores, "hasta
 *    completar los seis meses" laborados efectivamente (MTSS DAJ-AE-142-11).
 *  - Licencia de maternidad: SÍ es salario. "Las sumas percibidas durante ese
 *    período sí se tienen como salario para todos los efectos legales,
 *    inclusive para el pago de aguinaldo" (MTSS, mismo folleto), y los
 *    derechos se calculan "con base en el salario que tenía la persona
 *    trabajadora antes de dicha licencia" (MTSS DAJ-AER-OFP-1315-2023). La
 *    planilla no paga esos días en el base (la licencia se reparte como
 *    subsidio, 50 % patrono y 50 % CCSS), así que acá se le devuelve a cada
 *    quincena la parte del salario que la licencia cubrió.
 *  - Aguinaldo: hace falta "como mínimo un mes laborado para una misma
 *    persona empleadora en forma continua" (MTSS, mismo folleto). Quien entró
 *    el 1 de noviembre llega al 30 con un mes; quien entró el 2, no.
 */

import {
  calcularAntiguedad,
  calcularSalarioDiario,
  type SalarioDiarioResultado,
} from './liquidacion'
import { parseFechaLocal } from './fechas'
import { round2 } from './numeros'

/** tau_codigo de la licencia de maternidad en el catálogo de tipos de ausencia. */
export const CODIGO_LICENCIA_MATERNIDAD = 'INC_MAT'

/**
 * Quincenas que caben en "la última cincuentena" del Art. 157 CT: 50 semanas
 * son 350 días, y una quincena promedio dura 365 ÷ 24 = 15,2 días.
 */
export const QUINCENAS_PROMEDIO_VACACIONES = 23

const MS_DIA = 86_400_000

/** 'YYYY-MM-DD' a milisegundos UTC: sin horario de verano ni corrimientos. */
function utc(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

/** Día siguiente de una fecha 'YYYY-MM-DD'. */
export function diaSiguiente(fecha: string): string {
  return new Date(utc(fecha) + MS_DIA).toISOString().slice(0, 10)
}

/** Días naturales (ambos extremos incluidos) en que dos rangos se tocan. 0 si no. */
export function diasEnComun(inicioA: string, finA: string, inicioB: string, finB: string): number {
  const inicio = Math.max(utc(inicioA), utc(inicioB))
  const fin = Math.min(utc(finA), utc(finB))
  return fin < inicio ? 0 : Math.round((fin - inicio) / MS_DIA) + 1
}

/**
 * Días hábiles (sin domingos) en que dos rangos se tocan. Es la misma regla
 * con la que el módulo de Ausencias cuenta los días de unas vacaciones
 * (absences/lib/dateRange.ts): así lo que se descuenta es lo que la pantalla
 * de Ausencias dijo que se tomó.
 */
export function diasHabilesEnComun(
  inicioA: string,
  finA: string,
  inicioB: string,
  finB: string
): number {
  const inicio = Math.max(utc(inicioA), utc(inicioB))
  const fin = Math.min(utc(finA), utc(finB))
  let habiles = 0
  for (let t = inicio; t <= fin; t += MS_DIA) {
    if (new Date(t).getUTCDay() !== 0) habiles++
  }
  return habiles
}

/** Una ausencia aprobada que es subsidio (CCSS o INS): el salario se suspende. */
export interface AusenciaSubsidio {
  fechaInicio: string
  fechaFin: string
  esMaternidad: boolean
}

/** Una quincena de planilla del empleado, pagada o no. */
export interface QuincenaSalario {
  /** Clave ordenable: (año × 12 + mes) × 2 + (quincena − 1). */
  clave: number
  etiqueta: string
  fechaInicio: string
  fechaFin: string
  /** ndt_salario_bruto: lo que la planilla pagó como salario. */
  bruto: number
  pagado: boolean
  /**
   * Salario mensual del contrato de esa fila (el real; el base si no hay). Es
   * "el salario que tenía antes de la licencia": su mitad es lo que vale una
   * quincena completa.
   */
  salarioMensualContrato: number
}

export interface QuincenaComputable extends QuincenaSalario {
  diasQuincena: number
  /** Días de licencia de maternidad dentro de la quincena. */
  diasMaternidad: number
  /** Días de otros subsidios (incapacidad por enfermedad, riesgo del trabajo…). */
  diasSubsidio: number
  /** Salario que la licencia de maternidad cubrió en esta quincena. */
  montoMaternidad: number
  /** bruto + montoMaternidad: lo que cuenta como salario para los derechos. */
  salarioComputable: number
}

/**
 * Le pone a cada quincena sus días de licencia y de subsidio, y el salario
 * que cuenta para los derechos.
 *
 * La parte de maternidad es la quincena completa (salario ÷ 2) por la
 * fracción de días que cubrió la licencia, pero nunca lleva la quincena por
 * encima de salario ÷ 2: si esos días ya se pagaron en el base (una fila
 * digitada a mano, por ejemplo), sumarlos otra vez los contaría dos veces.
 */
export function computarQuincenas(
  quincenas: readonly QuincenaSalario[],
  subsidios: readonly AusenciaSubsidio[]
): QuincenaComputable[] {
  return quincenas.map((q) => {
    const diasQuincena = diasEnComun(q.fechaInicio, q.fechaFin, q.fechaInicio, q.fechaFin)
    let diasMaternidad = 0
    let diasSubsidio = 0
    for (const s of subsidios) {
      const dias = diasEnComun(q.fechaInicio, q.fechaFin, s.fechaInicio, s.fechaFin)
      if (s.esMaternidad) diasMaternidad += dias
      else diasSubsidio += dias
    }
    diasMaternidad = Math.min(diasMaternidad, diasQuincena)
    diasSubsidio = Math.min(diasSubsidio, diasQuincena)

    const quincenaCompleta = Math.max(q.salarioMensualContrato, 0) / 2
    const parte = diasQuincena > 0 ? (quincenaCompleta * diasMaternidad) / diasQuincena : 0
    const montoMaternidad = Math.min(parte, Math.max(0, quincenaCompleta - q.bruto))

    return {
      ...q,
      diasQuincena,
      diasMaternidad,
      diasSubsidio,
      montoMaternidad,
      salarioComputable: q.bruto + montoMaternidad,
    }
  })
}

export interface SumaCiclo {
  /** Salario computable de las quincenas PAGADAS del rango. Sin redondear. */
  suma: number
  /** Las del rango que todavía no se pagaron: no entraron en la suma. */
  sinPagar: QuincenaComputable[]
  /** Parte de la suma que vino de la licencia de maternidad. */
  maternidad: number
}

/** Suma el salario computable de las quincenas pagadas entre dos claves (incluidas). */
export function sumarCiclo(
  quincenas: readonly QuincenaComputable[],
  desdeClave: number,
  hastaClave: number
): SumaCiclo {
  const enRango = quincenas.filter((q) => q.clave >= desdeClave && q.clave <= hastaClave)
  const pagadas = enRango.filter((q) => q.pagado)
  return {
    suma: pagadas.reduce((acc, q) => acc + q.salarioComputable, 0),
    maternidad: pagadas.reduce((acc, q) => acc + q.montoMaternidad, 0),
    sinPagar: enRango.filter((q) => !q.pagado).sort((a, b) => a.clave - b.clave),
  }
}

export interface PromedioSinSubsidios extends SalarioDiarioResultado {
  /** Etiquetas de las quincenas que entraron, de la más reciente a la más vieja. */
  usadas: string[]
  /** Las que se saltaron por tener días de incapacidad. */
  excluidas: string[]
}

/**
 * Salario diario promedio de las últimas `cuantas` quincenas pagadas que no
 * tuvieron incapacidad, contando hacia atrás desde `hastaClave` (incluida).
 *
 * Una quincena con incapacidad no se promedia —su bruto está rebajado por un
 * subsidio que no es salario— y en su lugar entra la anterior (MTSS
 * DAJ-AE-142-11: "retrotraerse de la incapacidad para atrás, hasta completar
 * los seis meses"). La licencia de maternidad NO saca a la quincena: cuenta
 * con su salario completo.
 *
 * La división la hace calcularSalarioDiario: suma ÷ meses ÷ 30, y con menos
 * de dos quincenas cae al salario del contrato.
 */
export function promedioDiarioSinSubsidios(
  quincenas: readonly QuincenaComputable[],
  hastaClave: number,
  cuantas: number,
  salarioMensualContrato: number
): PromedioSinSubsidios {
  const candidatas = quincenas
    .filter((q) => q.pagado && q.clave <= hastaClave && q.salarioComputable > 0)
    .sort((a, b) => b.clave - a.clave)

  const usadas: QuincenaComputable[] = []
  const excluidas: string[] = []
  for (const q of candidatas) {
    if (usadas.length >= cuantas) break
    if (q.diasSubsidio > 0) {
      excluidas.push(q.etiqueta)
      continue
    }
    usadas.push(q)
  }

  const resultado = calcularSalarioDiario(
    usadas.map((q) => q.salarioComputable),
    salarioMensualContrato
  )
  return { ...resultado, usadas: usadas.map((q) => q.etiqueta), excluidas }
}

/**
 * ¿Llega a un mes continuo con la empresa? `ultimoDia` es el último día que
 * cuenta (el 30 de noviembre, o el día de salida): se incluye, por eso se
 * mide hasta el día siguiente. 1 nov → 30 nov es un mes; 2 nov → 30 nov, no.
 */
export function cumpleMesMinimoAguinaldo(ingreso: string, ultimoDia: string): boolean {
  if (utc(ultimoDia) < utc(ingreso)) return false
  const { meses } = calcularAntiguedad(
    parseFechaLocal(ingreso),
    parseFechaLocal(diaSiguiente(ultimoDia))
  )
  return meses >= 1
}

export interface VacacionesPropuestas {
  /** Meses de antigüedad, menos los que la persona pasó incapacitada. */
  mesesEfectivos: number
  /** Días de incapacidad (no maternidad) que se restaron. */
  diasIncapacidad: number
  diasGanados: number
  diasTomados: number
  diasPendientes: number
}

/**
 * Días de vacaciones que el sistema propone liquidar. Es una PROPUESTA:
 * quien liquida la puede corregir.
 *
 *  - Se gana un día por cada mes laborado: es la regla del MTSS para lo que
 *    se liquida al terminar ("un día por cada mes trabajado, al momento del
 *    retiro"), y equivale a las dos semanas (doce días hábiles) por cada
 *    cincuenta semanas del Art. 153 CT.
 *  - Los meses de incapacidad no cuentan: la incapacidad "suspende la
 *    relación laboral" y esas semanas no suman a las cincuenta (MTSS,
 *    folleto de Vacaciones; DAJ-AE-142-11). La licencia de maternidad sí
 *    cuenta. Se resta cada 30 días de incapacidad completos.
 *  - Se descuentan los días hábiles de vacaciones aprobadas en Ausencias.
 */
export function proponerVacaciones(input: {
  ingreso: string
  ultimoDia: string
  diasIncapacidad: number
  diasTomados: number
}): VacacionesPropuestas {
  const { meses } =
    utc(input.ultimoDia) < utc(input.ingreso)
      ? { meses: 0 }
      : calcularAntiguedad(
          parseFechaLocal(input.ingreso),
          parseFechaLocal(diaSiguiente(input.ultimoDia))
        )
  const diasIncapacidad = Math.max(0, input.diasIncapacidad)
  const mesesEfectivos = Math.max(0, meses - Math.floor(diasIncapacidad / 30))
  const diasTomados = Math.max(0, input.diasTomados)
  return {
    mesesEfectivos,
    diasIncapacidad,
    diasGanados: mesesEfectivos,
    diasTomados,
    diasPendientes: Math.max(0, mesesEfectivos - diasTomados),
  }
}

/** Clave ordenable de una quincena: (año × 12 + mes) × 2 + (quincena − 1). */
export function claveQuincenal(anio: number, mes: number, quincena: number): number {
  return (anio * 12 + mes) * 2 + (quincena - 1)
}

/** Clave de la quincena en la que cae una fecha 'YYYY-MM-DD'. */
export function claveDeFecha(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return claveQuincenal(anio, mes, dia <= 15 ? 1 : 2)
}

/** Un contrato (lab_id) de un empleado. */
export interface ContratoDelEmpleado {
  labId: number
  fechaInicio: string
  fechaFin: string | null
  /** lab_salario_real, o el base si el real no está. */
  salarioMensual: number
  /** Ya tiene una liquidación guardada: esa relación laboral terminó ahí. */
  liquidado: boolean
}

/**
 * Contratos que forman la MISMA relación laboral que `labId`.
 *
 * Un traslado de sucursal o un cambio de puesto cierra un lab_id y abre otro
 * sin que la persona deje la empresa: el aguinaldo y los promedios tienen que
 * ver las quincenas de los dos. Pero si un contrato anterior terminó con una
 * liquidación, ahí se le pagó todo (aguinaldo incluido) y lo que venga
 * después es una relación nueva: sus quincenas no se vuelven a contar.
 *
 * Regla: el contrato pedido, más los contratos del mismo empleado que
 * empezaron antes que él, que no tienen liquidación y que son posteriores a
 * la última liquidación.
 */
export function contratosDeLaRelacion(
  labId: number,
  contratos: readonly ContratoDelEmpleado[]
): ContratoDelEmpleado[] {
  const actual = contratos.find((c) => c.labId === labId)
  if (!actual) return []

  const cortes = contratos
    .filter((c) => c.labId !== labId && c.liquidado && c.fechaInicio <= actual.fechaInicio)
    .map((c) => c.fechaFin ?? c.fechaInicio)
  const ultimoCorte = cortes.length > 0 ? cortes.sort().at(-1)! : null

  return contratos
    .filter(
      (c) =>
        c.labId === labId ||
        (!c.liquidado &&
          c.fechaInicio <= actual.fechaInicio &&
          (ultimoCorte === null || c.fechaInicio > ultimoCorte))
    )
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))
}

/**
 * Desde cuándo trabaja la persona en ESTA relación laboral.
 *
 * Se usa la fecha de ingreso original de la ficha (la misma que usa la
 * liquidación para la antigüedad), salvo que un contrato anterior haya
 * terminado con liquidación después de esa fecha: entonces la persona salió
 * y volvió, y la relación arranca con el primer contrato después de esa
 * salida.
 */
export function inicioDeLaRelacion(
  ingresoOriginal: string | null,
  labId: number,
  contratos: readonly ContratoDelEmpleado[]
): string {
  const relacion = contratosDeLaRelacion(labId, contratos)
  const primero = relacion[0]?.fechaInicio ?? contratos.find((c) => c.labId === labId)?.fechaInicio
  const actual = contratos.find((c) => c.labId === labId)
  const cortes = contratos
    .filter(
      (c) => c.labId !== labId && c.liquidado && actual && c.fechaInicio <= actual.fechaInicio
    )
    .map((c) => c.fechaFin ?? c.fechaInicio)
    .sort()
  const ultimoCorte = cortes.at(-1) ?? null

  if (ingresoOriginal && (ultimoCorte === null || ingresoOriginal > ultimoCorte)) {
    return ingresoOriginal
  }
  return primero ?? ingresoOriginal ?? ''
}

export interface AguinaldoCalculado {
  anio: number
  /** Tiene el mes continuo que exige la ley al cierre del ciclo (o a la salida). */
  elegible: boolean
  /** Salario computable del ciclo ÷ 12, redondeado. 0 si no es elegible. */
  monto: number
  /** Salario computable del ciclo (quincenas pagadas + licencia de maternidad). */
  sumaSalarios: number
  /** Parte de sumaSalarios que vino de la licencia de maternidad. */
  maternidad: number
  /** Quincenas del ciclo sin pagar: no entraron. */
  sinPagar: string[]
  /** Último día que cuenta para el mes mínimo. */
  corte: string
}

/**
 * Aguinaldo de un ciclo completo (Ley 2412): salario del 1 de diciembre del
 * año anterior al 30 de noviembre, entre 12. Las quincenas de diciembre abren
 * el ciclo siguiente.
 */
export function aguinaldoDelCiclo(input: {
  quincenas: readonly QuincenaComputable[]
  anio: number
  inicioRelacion: string
}): AguinaldoCalculado {
  const desde = claveQuincenal(input.anio - 1, 12, 1)
  const hasta = claveQuincenal(input.anio, 11, 2)
  const corte = `${input.anio}-11-30`
  const ciclo = sumarCiclo(input.quincenas, desde, hasta)
  const elegible =
    input.inicioRelacion !== '' && cumpleMesMinimoAguinaldo(input.inicioRelacion, corte)
  const suma = round2(ciclo.suma)
  return {
    anio: input.anio,
    elegible,
    monto: elegible ? round2(ciclo.suma / 12) : 0,
    sumaSalarios: suma,
    maternidad: round2(ciclo.maternidad),
    sinPagar: ciclo.sinPagar.map((q) => q.etiqueta),
    corte,
  }
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/**
 * Agrega las quincenas de licencia de maternidad que no tienen fila de
 * planilla.
 *
 * Durante la licencia la planilla paga ₡0 de salario (la licencia se paga
 * como subsidio), y si alguien no le armó la fila a la persona esas
 * quincenas simplemente no existen: el aguinaldo y el promedio perdían la
 * licencia completa sin ningún aviso. Como la ley dice que esa plata ES
 * salario, se agrega la quincena con bruto 0 y computarQuincenas le pone la
 * parte de la licencia. Se toma el salario del contrato vigente ese día.
 */
export function completarQuincenasDeLicencia(
  quincenas: readonly QuincenaSalario[],
  subsidios: readonly AusenciaSubsidio[],
  contratos: readonly ContratoDelEmpleado[]
): QuincenaSalario[] {
  const existentes = new Set(quincenas.map((q) => q.clave))
  const agregadas: QuincenaSalario[] = []

  for (const s of subsidios.filter((x) => x.esMaternidad)) {
    let [anio, mes] = s.fechaInicio.split('-').map(Number)
    const [anioFin, mesFin] = s.fechaFin.split('-').map(Number)
    while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
      for (const quincena of [1, 2] as const) {
        const clave = claveQuincenal(anio, mes, quincena)
        const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
        const dos = (n: number) => String(n).padStart(2, '0')
        const inicio = `${anio}-${dos(mes)}-${quincena === 1 ? '01' : '16'}`
        const fin = `${anio}-${dos(mes)}-${quincena === 1 ? '15' : dos(ultimo)}`
        if (existentes.has(clave)) continue
        if (diasEnComun(inicio, fin, s.fechaInicio, s.fechaFin) === 0) continue
        const contrato = contratos.find(
          (c) => c.fechaInicio <= fin && (c.fechaFin === null || c.fechaFin >= inicio)
        )
        if (!contrato) continue
        existentes.add(clave)
        agregadas.push({
          clave,
          etiqueta: `${MESES[mes - 1]} ${anio} · ${quincena === 1 ? '1ª' : '2ª'} quincena (licencia, sin planilla)`,
          fechaInicio: inicio,
          fechaFin: fin,
          bruto: 0,
          pagado: true,
          salarioMensualContrato: contrato.salarioMensual,
        })
      }
      mes++
      if (mes > 12) {
        mes = 1
        anio++
      }
    }
  }

  return [...quincenas, ...agregadas].sort((a, b) => a.clave - b.clave)
}
