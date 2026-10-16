import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import type { LineaCalculada, LineaPatronalCalculada } from '@/modules/payroll/lib/planilla'
import { round2 } from '@/modules/payroll/lib/numeros'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Datos de una línea que NO salen del motor de cálculo y que hay que
 * conservar cuando la planilla se recalcula.
 *
 * El motor solo sabe de conceptos y montos. Estas columnas cuentan de dónde
 * vino la línea —de qué beneficio del empleado, si la autorizó él mismo, con
 * qué nota— y las pone quien registra la deducción, no el cálculo. Borrar y
 * reinsertar las líneas en cada recálculo las perdía en silencio: después de
 * subir el Excel una segunda vez, un rebajo voluntario quedaba indistinguible
 * de uno que impuso el patrono, y el vínculo con sgrh_beneficios_empleado
 * desaparecía.
 */
interface MetadatosDeduccion {
  ded_es_voluntaria: boolean
  ded_beneficio_id: number | null
  ded_observacion: string | null
}

interface MetadatosIngreso {
  ing_observacion: string | null
}

interface LineaIngresoPrevia {
  ing_concepto_id: number
  ing_observacion: string | null
}

interface LineaDeduccionPrevia {
  ded_concepto_id: number
  ded_es_voluntaria: boolean
  ded_beneficio_id: number | null
  ded_observacion: string | null
}

/**
 * Reemplaza las líneas de ingreso y deducción de un detalle con las que
 * calculó el motor, conservando los metadatos de las que ya estaban.
 *
 * Se comparte entre la subida de Excel (uploadPlanilla) y la edición manual
 * (updateDetalleManual), que hacían lo mismo por separado.
 *
 * El emparejamiento es por concepto: si antes había una deducción de
 * "Préstamo personal" vinculada a un beneficio, la nueva línea de "Préstamo
 * personal" hereda ese vínculo. Un concepto que no estaba antes empieza sin
 * metadatos, y uno que desaparece del cálculo se va con ellos — que es lo
 * correcto: la deducción ya no existe en este periodo.
 */
export async function reemplazarLineasDetalle(
  supabase: SupabaseServerClient,
  ndtId: number,
  lineas: LineaCalculada[],
  lineasPatronales: LineaPatronalCalculada[] = []
): Promise<{ error: string | null }> {
  const [{ data: ingresosPrevios }, { data: deduccionesPrevias }] = await Promise.all([
    supabase
      .from('sgrh_nomina_linea_ingreso')
      .select('ing_concepto_id, ing_observacion')
      .eq('ing_nomina_detalle_id', ndtId)
      .returns<LineaIngresoPrevia[]>(),
    supabase
      .from('sgrh_nomina_linea_deduccion')
      .select('ded_concepto_id, ded_es_voluntaria, ded_beneficio_id, ded_observacion')
      .eq('ded_nomina_detalle_id', ndtId)
      .returns<LineaDeduccionPrevia[]>(),
  ])

  const metaIngreso = new Map<number, MetadatosIngreso>(
    (ingresosPrevios ?? []).map((l) => [
      l.ing_concepto_id,
      { ing_observacion: l.ing_observacion ?? null },
    ])
  )
  const metaDeduccion = new Map<number, MetadatosDeduccion>(
    (deduccionesPrevias ?? []).map((l) => [
      l.ded_concepto_id,
      {
        ded_es_voluntaria: l.ded_es_voluntaria ?? false,
        ded_beneficio_id: l.ded_beneficio_id ?? null,
        ded_observacion: l.ded_observacion ?? null,
      },
    ])
  )

  // Los dos borrados son independientes y antes corrían uno tras otro: el
  // error se revisa después de los dos, igual que antes.
  const [{ error: errDelIngreso }, { error: errDelDeduccion }] = await Promise.all([
    supabase.from('sgrh_nomina_linea_ingreso').delete().eq('ing_nomina_detalle_id', ndtId),
    supabase.from('sgrh_nomina_linea_deduccion').delete().eq('ded_nomina_detalle_id', ndtId),
  ])

  if (errDelIngreso || errDelDeduccion) {
    return { error: 'No se pudieron actualizar las líneas de la planilla.' }
  }

  const ingresos = lineas
    .filter((l) => l.esIngreso)
    .map((l) => ({
      ing_nomina_detalle_id: ndtId,
      ing_concepto_id: l.con_id,
      ing_monto: l.monto,
      ing_observacion: metaIngreso.get(l.con_id)?.ing_observacion ?? null,
    }))

  if (ingresos.length > 0) {
    const { error } = await supabase.from('sgrh_nomina_linea_ingreso').insert(ingresos)
    if (error) return { error: 'No se pudieron guardar las líneas de ingreso.' }
  }

  const deducciones = lineas
    .filter((l) => !l.esIngreso)
    .map((l) => {
      const meta = metaDeduccion.get(l.con_id)
      return {
        ded_nomina_detalle_id: ndtId,
        ded_concepto_id: l.con_id,
        ded_monto: l.monto,
        ded_porcentaje_aplicado: l.porcentajeAplicado ?? null,
        ded_base_calculo: l.baseCalculo ?? null,
        ded_es_voluntaria: meta?.ded_es_voluntaria ?? false,
        ded_beneficio_id: meta?.ded_beneficio_id ?? null,
        ded_observacion: meta?.ded_observacion ?? null,
      }
    })

  if (deducciones.length > 0) {
    const { error } = await supabase.from('sgrh_nomina_linea_deduccion').insert(deducciones)
    if (error) return { error: 'No se pudieron guardar las líneas de deducción.' }
  }

  // Cargas patronales. No tienen metadatos que conservar: las calcula entero
  // el motor a partir del catálogo, así que se borran y se reescriben.
  const { error: errDelPatronal } = await supabase
    .from('sgrh_nomina_linea_patronal')
    .delete()
    .eq('pat_nomina_detalle_id', ndtId)

  if (errDelPatronal) {
    return { error: 'No se pudieron actualizar las cargas patronales.' }
  }

  if (lineasPatronales.length > 0) {
    const { error } = await supabase.from('sgrh_nomina_linea_patronal').insert(
      lineasPatronales.map((l) => ({
        pat_nomina_detalle_id: ndtId,
        pat_concepto_id: l.con_id,
        pat_monto: l.monto,
        pat_porcentaje_aplicado: l.porcentajeAplicado,
        pat_base_calculo: l.baseCalculo,
      }))
    )
    if (error) return { error: 'No se pudieron guardar las cargas patronales.' }
  }

  return { error: null }
}

/** Mismo mensaje que sincronizarMovimientoBancoHoras al insertar un movimiento. */
export const ERROR_REGISTRAR_BANCO_HORAS = 'No se pudo registrar en el banco de horas.'

export interface FilaNuevaConLineas {
  ndtId: number
  labId: number
  lineas: LineaCalculada[]
  lineasPatronales: LineaPatronalCalculada[]
  /** Horas por encima de la jornada: van pendientes al banco de horas. */
  horasExtra: number
  salarioPorHora: number
}

/**
 * Líneas y movimientos del banco de horas de filas RECIÉN insertadas, en
 * cuatro inserciones en vez de ~9 viajes a la base por fila.
 *
 * Es lo mismo que llamar a reemplazarLineasDetalle y a
 * sincronizarMovimientoBancoHoras fila por fila, pero sin lo que en una fila
 * nueva no puede pasar:
 *  - no hay líneas anteriores, así que no hay metadatos que conservar ni nada
 *    que borrar (las líneas nacen sin observación, no voluntarias y sin
 *    beneficio, igual que antes);
 *  - no hay movimiento del banco anterior (bhm_nomina_detalle_id es UNIQUE y
 *    la fila acaba de nacer), así que solo se inserta si hay horas extra.
 *
 * Con 30 empleados, crear un periodo pasaba de ~270 viajes en fila a 4 en
 * paralelo. Los mensajes de error son los mismos de las dos funciones.
 */
export async function insertarLineasFilasNuevas(
  supabase: SupabaseServerClient,
  filas: FilaNuevaConLineas[]
): Promise<{ error: string | null }> {
  if (filas.length === 0) return { error: null }

  const ingresos = filas.flatMap((f) =>
    f.lineas
      .filter((l) => l.esIngreso)
      .map((l) => ({
        ing_nomina_detalle_id: f.ndtId,
        ing_concepto_id: l.con_id,
        ing_monto: l.monto,
        ing_observacion: null,
      }))
  )
  const deducciones = filas.flatMap((f) =>
    f.lineas
      .filter((l) => !l.esIngreso)
      .map((l) => ({
        ded_nomina_detalle_id: f.ndtId,
        ded_concepto_id: l.con_id,
        ded_monto: l.monto,
        ded_porcentaje_aplicado: l.porcentajeAplicado ?? null,
        ded_base_calculo: l.baseCalculo ?? null,
        ded_es_voluntaria: false,
        ded_beneficio_id: null,
        ded_observacion: null,
      }))
  )
  const patronales = filas.flatMap((f) =>
    f.lineasPatronales.map((l) => ({
      pat_nomina_detalle_id: f.ndtId,
      pat_concepto_id: l.con_id,
      pat_monto: l.monto,
      pat_porcentaje_aplicado: l.porcentajeAplicado,
      pat_base_calculo: l.baseCalculo,
    }))
  )
  const movimientos = filas
    .map((f) => ({ f, horas: Math.max(0, round2(f.horasExtra)) }))
    .filter(({ horas }) => horas > 0)
    .map(({ f, horas }) => ({
      bhm_historial_laboral_id: f.labId,
      bhm_nomina_detalle_id: f.ndtId,
      bhm_horas: horas,
      bhm_salario_por_hora: f.salarioPorHora,
    }))

  const sinError = Promise.resolve({ error: null })
  const [rIngresos, rDeducciones, rPatronales, rBanco] = await Promise.all([
    ingresos.length > 0 ? supabase.from('sgrh_nomina_linea_ingreso').insert(ingresos) : sinError,
    deducciones.length > 0
      ? supabase.from('sgrh_nomina_linea_deduccion').insert(deducciones)
      : sinError,
    patronales.length > 0
      ? supabase.from('sgrh_nomina_linea_patronal').insert(patronales)
      : sinError,
    movimientos.length > 0
      ? supabase.from('sgrh_banco_horas_movimientos').insert(movimientos)
      : sinError,
  ])

  if (rIngresos.error) return { error: 'No se pudieron guardar las líneas de ingreso.' }
  if (rDeducciones.error) return { error: 'No se pudieron guardar las líneas de deducción.' }
  if (rPatronales.error) return { error: 'No se pudieron guardar las cargas patronales.' }
  if (rBanco.error) return { error: ERROR_REGISTRAR_BANCO_HORAS }
  return { error: null }
}
