/**
 * Líneas de un detalle que el recálculo NO puede reproducir, y que por eso hay
 * que conservar a mano.
 *
 * Todo lo que reescribe un detalle (subir el Excel, editarlo a mano, pagar o
 * revertir banco de horas) hace lo mismo: recalcula con los conceptos ACTIVOS
 * del catálogo y después borra todas las líneas y reinserta lo que devolvió el
 * motor. Una línea cuyo concepto no está en esa lista no tiene cómo volver a
 * generarse, así que desaparecía en silencio y el bruto bajaba.
 *
 * El caso real es HORAS_EXTRA —desactivado a propósito desde que existe el
 * banco de horas, y sin embargo es la línea con la que se paga—, pero pasa
 * igual con cualquier concepto que se desactive del catálogo mientras un
 * periodo en borrador ya tiene líneas suyas: una cuota, un préstamo, un
 * embargo.
 *
 * La regla es una sola: lo que el motor no va a recalcular, se conserva tal
 * como estaba, forzado a "monto manual". Las deducciones PORCENTUALES son la
 * excepción — la CCSS se vuelve a sacar sobre el bruto nuevo, arrastrar su
 * monto viejo sería cobrar el porcentaje de un salario que ya no existe.
 */

import type { createClient } from '@/lib/supabase/server'
import type { ConceptoCalculo } from '@/modules/payroll/lib/planilla'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Concepto tal como viene del join de una línea ya guardada. */
export interface ConceptoDeLinea {
  con_id: number
  con_codigo: string
  con_tipo: string
  con_afecta_salario_bruto: boolean
  con_afecta_base_ccss: boolean
  con_tipo_calculo: string
  con_porcentaje: number | null
}

export interface LineaAjena {
  concepto: ConceptoDeLinea
  monto: number
  esIngreso: boolean
}

/** Campos del concepto que hay que traer en el join para poder conservar la línea. */
export const CAMPOS_CONCEPTO_DE_LINEA =
  'con_id, con_codigo, con_tipo, con_afecta_salario_bruto, con_afecta_base_ccss, con_tipo_calculo, con_porcentaje'

/**
 * ¿Esta línea guardada hay que conservarla?
 *
 * `codigosQueSeRecalculan` son los códigos que el motor va a producir en esta
 * pasada (los conceptos activos, más los que el formulario o el Excel traigan).
 * Si el código está ahí, la línea se va a regenerar sola y no hay nada que
 * conservar.
 */
export function esLineaAjena(
  concepto: ConceptoDeLinea,
  codigosQueSeRecalculan: ReadonlySet<string>
): boolean {
  if (codigosQueSeRecalculan.has(concepto.con_codigo)) return false
  // El motor la vuelve a calcular sobre el bruto nuevo.
  if (concepto.con_tipo_calculo === 'porcentaje_deduccion_bruto') return false
  return true
}

/**
 * Mete las líneas ajenas al cálculo: sus conceptos se agregan forzados a monto
 * manual y sus montos se suman a los que ya había.
 *
 * Se SUMA en vez de pisar porque el mismo código podría venir por los dos
 * lados; en la práctica no pasa (una línea solo es ajena cuando su código no
 * está entre los que se recalculan), así que la suma es siempre sobre 0.
 */
export function fusionarAjenas(
  conceptosActivos: readonly ConceptoCalculo[],
  montos: Record<string, number>,
  ajenas: readonly LineaAjena[]
): { conceptos: ConceptoCalculo[]; montos: Record<string, number> } {
  if (ajenas.length === 0) {
    return { conceptos: [...conceptosActivos], montos: { ...montos } }
  }

  const montosFusionados = { ...montos }
  const conceptos: ConceptoCalculo[] = [...conceptosActivos]

  for (const { concepto, monto, esIngreso } of ajenas) {
    montosFusionados[concepto.con_codigo] = (montosFusionados[concepto.con_codigo] ?? 0) + monto
    conceptos.push({
      ...concepto,
      con_tipo_calculo: esIngreso ? 'monto_manual_ingreso' : 'monto_manual_deduccion',
    })
  }

  return { conceptos, montos: montosFusionados }
}

interface LineaIngresoConConcepto {
  ing_monto: number
  sgrh_cat_conceptos_nomina: ConceptoDeLinea | null
}

interface LineaDeduccionConConcepto {
  ded_monto: number
  sgrh_cat_conceptos_nomina: ConceptoDeLinea | null
}

/**
 * Lee de un detalle las líneas que `conceptosQueSeRecalculan` no va a
 * reproducir, para poder conservarlas.
 *
 * Es la versión de un solo detalle; la subida de Excel lee todos los del
 * periodo de una sola vez y arma la misma lista a mano.
 */
export async function leerLineasAjenas(
  supabase: SupabaseServerClient,
  ndtId: number,
  conceptosQueSeRecalculan: readonly ConceptoCalculo[]
): Promise<{ ajenas: LineaAjena[]; error: string | null }> {
  const codigos = new Set(conceptosQueSeRecalculan.map((c) => c.con_codigo))

  const [{ data: ingresos, error: errIngresos }, { data: deducciones, error: errDeducciones }] =
    await Promise.all([
      supabase
        .from('sgrh_nomina_linea_ingreso')
        .select(`ing_monto, sgrh_cat_conceptos_nomina ( ${CAMPOS_CONCEPTO_DE_LINEA} )`)
        .eq('ing_nomina_detalle_id', ndtId)
        .returns<LineaIngresoConConcepto[]>(),
      supabase
        .from('sgrh_nomina_linea_deduccion')
        .select(`ded_monto, sgrh_cat_conceptos_nomina ( ${CAMPOS_CONCEPTO_DE_LINEA} )`)
        .eq('ded_nomina_detalle_id', ndtId)
        .returns<LineaDeduccionConConcepto[]>(),
    ])

  if (errIngresos || errDeducciones) {
    return { ajenas: [], error: 'No se pudieron leer las líneas guardadas del periodo.' }
  }

  const ajenas: LineaAjena[] = []
  for (const linea of ingresos ?? []) {
    const concepto = linea.sgrh_cat_conceptos_nomina
    if (concepto && esLineaAjena(concepto, codigos)) {
      ajenas.push({ concepto, monto: linea.ing_monto, esIngreso: true })
    }
  }
  for (const linea of deducciones ?? []) {
    const concepto = linea.sgrh_cat_conceptos_nomina
    if (concepto && esLineaAjena(concepto, codigos)) {
      ajenas.push({ concepto, monto: linea.ded_monto, esIngreso: false })
    }
  }

  return { ajenas, error: null }
}
