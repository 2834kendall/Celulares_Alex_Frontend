import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import type { LineaCalculada, LineaPatronalCalculada } from '@/modules/payroll/lib/planilla'

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

  const { error: errDelIngreso } = await supabase
    .from('sgrh_nomina_linea_ingreso')
    .delete()
    .eq('ing_nomina_detalle_id', ndtId)
  const { error: errDelDeduccion } = await supabase
    .from('sgrh_nomina_linea_deduccion')
    .delete()
    .eq('ded_nomina_detalle_id', ndtId)

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
