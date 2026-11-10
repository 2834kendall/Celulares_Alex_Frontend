/**
 * Lo que el patrono paga en una incapacidad o licencia (maternidad,
 * paternidad…), con los números del TIPO de ausencia que la causó, y el
 * estimado de lo que paga la CCSS (o el INS) esos días.
 *
 * Antes todas las filas usaban el % de INC_ENF, también una licencia de
 * maternidad, y el monto iba sin rebajo de CCSS. Ahora cada tipo de ausencia
 * dice (Ausencias → Tipos, todo editable):
 *  - tau_porcentaje_pago_empleador: % del salario que paga el patrono;
 *  - tau_porcentaje_cuota_obrera: % de cuota obrera que se le rebaja a ese
 *    monto (0 = nada, lo de siempre). Las fuentes no coinciden sobre si
 *    corresponde en la licencia de maternidad (Art. 95 CT con la Ley 10211
 *    vs. el folleto del MTSS), así que lo decide quien configura el tipo;
 *  - tau_porcentaje_subsidio_ccss y tau_paga_ccss_desde_dia: cuánto paga la
 *    CCSS y desde qué día de la ausencia. Es INFORMATIVO: la CCSS se lo paga
 *    directo a la persona, y lo calcula sobre su propio promedio salarial,
 *    así que acá es un estimado con el salario del contrato.
 *
 * Funciones puras: la planilla (getPeriodoDetail) y el pago
 * (marcarDetallePagado) hacen la misma cuenta con estas.
 */

import { round2 } from './numeros'
import { montoIncapacidadEnVivo, salarioMensualIncapacidad } from './incapacidad'

/** Código del tipo que se usa cuando no se encuentra la ausencia de la fila. */
export const CODIGO_INCAPACIDAD_ENFERMEDAD = 'INC_ENF'

/** Columnas del tipo de ausencia que usa este cálculo. */
export const SELECT_TIPO_SUBSIDIO =
  'tau_codigo, tau_nombre, tau_requiere_documento_ccss, tau_es_intradia, tau_paga_empleador_dias, tau_porcentaje_pago_empleador, tau_porcentaje_cuota_obrera, tau_porcentaje_subsidio_ccss, tau_paga_ccss_desde_dia'

export interface TipoSubsidioRow {
  tau_codigo: string
  tau_nombre: string
  tau_requiere_documento_ccss: boolean
  tau_es_intradia?: boolean | null
  tau_paga_empleador_dias?: number | null
  tau_porcentaje_pago_empleador: number | null
  tau_porcentaje_cuota_obrera?: number | null
  tau_porcentaje_subsidio_ccss: number | null
  tau_paga_ccss_desde_dia: number | null
}

export interface ParametrosSubsidio {
  codigo: string
  nombre: string
  /**
   * El patrono paga algo en este tipo (días de tope > 0 y % > 0). Una
   * incapacidad por riesgo del trabajo (tope 0, la paga el INS) no aporta
   * días del patrono a la fila.
   */
  pagaPatrono: boolean
  porcentajePagoEmpleador: number
  porcentajeCuotaObrera: number
  /** null = la CCSS/INS no paga nada en este tipo (o no está configurado). */
  porcentajeSubsidioCcss: number | null
  /** Día de la ausencia desde el que paga la CCSS (1 = desde el primero). */
  ccssDesdeDia: number | null
}

/** Una ausencia aprobada con su tipo, recortada a lo que importa acá. */
export interface AusenciaSubsidio {
  inicio: string
  fin: string
  tipo: ParametrosSubsidio
}

/** Un % del catálogo: número entre 0 y 100. Cualquier otra cosa cuenta como 0. */
function porcentaje(valor: unknown): number {
  const n = Number(valor ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 100)
}

export function parametrosDeTipo(tipo: TipoSubsidioRow): ParametrosSubsidio {
  const subsidio = tipo.tau_porcentaje_subsidio_ccss
  const desde = Number(tipo.tau_paga_ccss_desde_dia)
  return {
    codigo: tipo.tau_codigo,
    nombre: tipo.tau_nombre,
    // Sin la columna (lectura vieja) se asume que paga: lo decide el %.
    pagaPatrono:
      porcentaje(tipo.tau_porcentaje_pago_empleador) > 0 &&
      (tipo.tau_paga_empleador_dias === undefined ||
        tipo.tau_paga_empleador_dias === null ||
        Number(tipo.tau_paga_empleador_dias) > 0),
    porcentajePagoEmpleador: porcentaje(tipo.tau_porcentaje_pago_empleador),
    porcentajeCuotaObrera: porcentaje(tipo.tau_porcentaje_cuota_obrera),
    porcentajeSubsidioCcss:
      subsidio === null || subsidio === undefined ? null : porcentaje(subsidio),
    ccssDesdeDia: Number.isInteger(desde) && desde >= 1 ? desde : null,
  }
}

/**
 * ¿Esta ausencia pasa por el camino del subsidio? Lo mismo que mira
 * ausenciaNominaSync al repartir los días: certificada por la CCSS o el INS y
 * de día completo.
 */
export function esAusenciaDeSubsidio(tipo: TipoSubsidioRow | null | undefined): boolean {
  return Boolean(tipo?.tau_requiere_documento_ccss) && !tipo?.tau_es_intradia
}

const MS_DIA = 86_400_000

function utc(fecha: string): number {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

/** Días de la ausencia que caen en el periodo (ambos extremos incluidos). */
export function diasDeAusenciaEnPeriodo(
  ausencia: { inicio: string; fin: string },
  periodo: { inicio: string; fin: string }
): number {
  const desde = Math.max(utc(ausencia.inicio), utc(periodo.inicio))
  const hasta = Math.min(utc(ausencia.fin), utc(periodo.fin))
  return hasta < desde ? 0 : Math.round((hasta - desde) / MS_DIA) + 1
}

/**
 * Tipo con que se calcula lo que paga el patrono en una fila: el de la
 * ausencia con más días dentro del periodo (empate: la que empezó primero),
 * entre las que el patrono SÍ paga. La fila guarda los días del patrono sin
 * decir de qué ausencia salieron, y solo un tipo que paga puede haberlos
 * puesto: un riesgo del trabajo (lo paga el INS) seguido de una gripe deja
 * los días del patrono de la gripe, aunque el riesgo tenga más días. Con una
 * sola ausencia, que es el caso normal, no hay nada que elegir. null si no
 * hay ninguna (se usa INC_ENF, lo de antes).
 */
export function tipoDeLaFila(
  ausencias: AusenciaSubsidio[],
  periodo: { inicio: string; fin: string }
): ParametrosSubsidio | null {
  let elegido: { tipo: ParametrosSubsidio; dias: number; inicio: string } | null = null
  for (const a of ausencias) {
    if (!a.tipo.pagaPatrono) continue
    const dias = diasDeAusenciaEnPeriodo(a, periodo)
    if (dias <= 0) continue
    if (!elegido || dias > elegido.dias || (dias === elegido.dias && a.inicio < elegido.inicio)) {
      elegido = { tipo: a.tipo, dias, inicio: a.inicio }
    }
  }
  return elegido?.tipo ?? null
}

export interface ContratoSubsidio {
  salarioBaseMensual: number
  salarioRealMensual: number | null
}

export interface MontoSubsidioPatrono {
  /** Lo que paga el patrono, antes de la cuota obrera. */
  montoEmpleador: number
  porcentajeCuotaObrera: number
  cuotaObrera: number
  /** Lo que se le entrega a la persona: montoEmpleador − cuotaObrera. */
  neto: number
}

/** Monto del patrono con su cuota obrera, con el salario y los % de hoy. */
export function subsidioPatronoEnVivo(
  diasEmpleador: number,
  contrato: ContratoSubsidio,
  tipo: Pick<ParametrosSubsidio, 'porcentajePagoEmpleador' | 'porcentajeCuotaObrera'>
): MontoSubsidioPatrono {
  const montoEmpleador = montoIncapacidadEnVivo(
    diasEmpleador,
    contrato,
    tipo.porcentajePagoEmpleador
  )
  return conCuotaObrera(montoEmpleador, tipo.porcentajeCuotaObrera)
}

/** Aplica la cuota obrera a un monto del patrono ya calculado (o congelado). */
export function conCuotaObrera(
  montoEmpleador: number,
  porcentajeCuotaObrera: number
): MontoSubsidioPatrono {
  const pct = porcentaje(porcentajeCuotaObrera)
  const cuotaObrera = round2(montoEmpleador * (pct / 100))
  return {
    montoEmpleador,
    porcentajeCuotaObrera: pct,
    cuotaObrera,
    neto: round2(montoEmpleador - cuotaObrera),
  }
}

/**
 * Estimado de lo que paga la CCSS (o el INS) en los días del periodo. null si
 * ninguna ausencia tiene subsidio configurado: no se muestra nada, igual que
 * antes.
 *
 * Dos clases de tipo:
 *  - La CCSS paga desde el día 1, a la par del patrono (maternidad,
 *    paternidad, riesgo del trabajo): todos los días de la ausencia en el
 *    periodo, cada una con su %.
 *  - La CCSS paga después de los días del patrono (enfermedad, desde el día
 *    4): son los días que la fila ya tiene como de la CCSS
 *    (`diasCcssDeLaFila`), que el reparto de la planilla cuenta con el tope
 *    MENSUAL del patrono. Contarlos desde el inicio de la ausencia daba otro
 *    número al lado de "Días pagados por la CCSS". Se usa el % de la de más
 *    días en el periodo.
 */
export function subsidioCcssEstimado(
  ausencias: AusenciaSubsidio[],
  periodo: { inicio: string; fin: string },
  contrato: ContratoSubsidio,
  diasCcssDeLaFila: number
): number | null {
  const diario = salarioMensualIncapacidad(contrato) / 30
  let total = 0
  let alguno = false
  let posterior: { pct: number; dias: number } | null = null
  for (const a of ausencias) {
    const { porcentajeSubsidioCcss: pct, ccssDesdeDia: desde } = a.tipo
    if (pct === null || pct <= 0 || desde === null) continue
    const enPeriodo = diasDeAusenciaEnPeriodo(a, periodo)
    if (enPeriodo <= 0) continue
    if (desde === 1) {
      alguno = true
      total += enPeriodo * diario * (pct / 100)
    } else if (!posterior || enPeriodo > posterior.dias) {
      posterior = { pct, dias: enPeriodo }
    }
  }
  const diasCcss = Math.max(0, Number(diasCcssDeLaFila) || 0)
  if (posterior && diasCcss > 0) {
    alguno = true
    total += diasCcss * diario * (posterior.pct / 100)
  }
  return alguno ? round2(total) : null
}
