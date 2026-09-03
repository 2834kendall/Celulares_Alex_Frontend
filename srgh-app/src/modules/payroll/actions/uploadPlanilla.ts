'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  agruparConceptosPlanilla,
  calcularPlanillaPorConceptos,
  sameRowValues,
  type ConceptoPlanillaColumna,
  type LineaCalculada,
  type PlanillaRowInput,
} from '@/modules/payroll/lib/planilla'
import { parsePlanillaWorkbook } from '@/modules/payroll/lib/planillaExcel'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import { sincronizarMovimientoBancoHoras } from '@/modules/payroll/lib/bancoHorasAccrual'

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB: la planilla real pesa unos pocos KB

interface DetalleExistenteRow {
  ndt_id: number
  ndt_historial_laboral_id: number
  ndt_horas_ordinarias_diurnas: number
  ndt_salario_por_hora: number
}

interface LineaIngresoExistenteRow {
  ing_nomina_detalle_id: number
  ing_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string } | null
}

interface LineaDeduccionExistenteRow {
  ded_nomina_detalle_id: number
  ded_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string } | null
}

interface DetalleInsertadoRow {
  ndt_id: number
  ndt_historial_laboral_id: number
}

/** Valores previos de una fila, en el mismo shape que PlanillaRowInput (sin cédula) para comparar con sameRowValues. */
interface ValoresPrevios {
  horasTrabajadas: number
  salarioPorHora: number
  montos: Record<string, number>
}

export type UploadPlanillaResult =
  | {
      ok: true
      empleados: number
      nuevos: number
      actualizados: number
      sinCambios: number
      eliminados: number
    }
  | { ok: false; error: string }

/**
 * Sube la planilla llena y la sincroniza con el periodo (solo en borrador).
 * En vez de reemplazar todo, compara cada fila del Excel contra lo ya
 * guardado: si un empleado no cambió se deja intacto (no se toca su ndt_id,
 * ndt_pagado ni fechas); solo se inserta, actualiza o elimina lo que
 * realmente cambió.
 *
 * Los montos SIEMPRE se recalculan en el servidor con
 * calcularPlanillaPorConceptos — el mismo motor dinámico que usa la edición
 * manual del detalle. No hay conceptos fijos quemados en código: cualquier
 * concepto activo del catálogo (bono, préstamo, etc.) se aplica solo, y las
 * horas extra / el % de CCSS salen de cómo esté configurado el catálogo, no
 * de un valor fijo en el código.
 */
export async function uploadPlanilla(formData: FormData): Promise<UploadPlanillaResult> {
  const periodoId = Number(formData.get('periodoId'))
  const file = formData.get('file')

  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return { ok: false, error: 'Periodo inválido.' }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona el archivo de planilla (.xlsx).' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'El archivo supera el límite de 2 MB.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  // 1. El periodo debe existir (RLS: solo de la empresa del JWT) y estar en borrador
  const { data: periodo, error: errPeriodo } = await supabase
    .from('sgrh_nomina_periodo')
    .select('npe_id, npe_estado, npe_sucursal_id')
    .eq('npe_id', periodoId)
    .maybeSingle()

  if (errPeriodo) {
    return { ok: false, error: 'No se pudo cargar el periodo.' }
  }
  if (!periodo) {
    return { ok: false, error: 'El periodo no existe o no es visible.' }
  }
  if (periodo.npe_estado !== 'borrador') {
    return { ok: false, error: 'Solo se puede subir planilla a un periodo en borrador.' }
  }

  // 2. Conceptos activos del catálogo — definen las columnas del Excel y el
  // cálculo. Se cargan antes de parsear porque el parseo necesita saber qué
  // columnas de monto manual buscar (por el nombre del concepto).
  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select('con_id, con_codigo, con_nombre, con_tipo, con_tipo_calculo, con_porcentaje')
    .eq('con_activo', true)
    .returns<ConceptoPlanillaColumna[]>()

  if (errConceptos) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }
  if (!conceptos || conceptos.length === 0) {
    return {
      ok: false,
      error:
        'No hay conceptos activos en el catálogo. Crea al menos uno en "Conceptos de nómina" antes de subir la planilla.',
    }
  }

  const { ingresoManual, deduccionManual } = agruparConceptosPlanilla(conceptos)
  const codigosManuales = [...ingresoManual, ...deduccionManual].map((c) => c.con_codigo)

  // 3. Leer y validar el Excel
  const { rows, errors } = await parsePlanillaWorkbook(await file.arrayBuffer(), conceptos)

  if (errors.length > 0) {
    const detalle = errors
      .slice(0, 5)
      .map((e) => `fila ${e.fila}: ${e.mensaje}`)
      .join(' · ')
    return { ok: false, error: `El archivo tiene errores — ${detalle}` }
  }
  if (rows.length === 0) {
    return { ok: false, error: 'El archivo no tiene filas de empleados.' }
  }

  // 4. Resolver cédulas contra los contratos activos de la sucursal
  const empleadosResult = await getEmpleadosActivos(supabase, periodo.npe_sucursal_id)
  if (!empleadosResult.ok) {
    return { ok: false, error: empleadosResult.error }
  }

  const porCedula = new Map(empleadosResult.data.map((e) => [e.cedula, e]))
  const desconocidas = rows.filter((r) => !porCedula.has(r.cedula)).map((r) => r.cedula)
  if (desconocidas.length > 0) {
    return {
      ok: false,
      error: `Cédulas sin contrato activo en la sucursal: ${desconocidas.slice(0, 5).join(', ')}.`,
    }
  }

  // 5. Planilla ya guardada en el periodo (para comparar, no para borrar de una vez)
  const { data: detallesPrevios, error: errPrevios } = await supabase
    .from('sgrh_nomina_detalle')
    .select('ndt_id, ndt_historial_laboral_id, ndt_horas_ordinarias_diurnas, ndt_salario_por_hora')
    .eq('ndt_nomina_periodo_id', periodoId)
    .returns<DetalleExistenteRow[]>()

  if (errPrevios) {
    return { ok: false, error: 'No se pudo revisar la planilla existente.' }
  }

  const ndtIdPorLab = new Map<number, number>(
    (detallesPrevios ?? []).map((d: DetalleExistenteRow): [number, number] => [
      d.ndt_historial_laboral_id,
      d.ndt_id,
    ])
  )
  const idsPrevios = (detallesPrevios ?? []).map((d: DetalleExistenteRow) => d.ndt_id)

  // Valores previos de cada ndt_id (horas, salario por hora, montos por
  // concepto manual), para reconstruir qué había y compararlo contra el
  // Excel. Los códigos ausentes cuentan como 0, igual que un campo vacío.
  const valoresPreviosPorNdt = new Map<number, ValoresPrevios>()
  if (idsPrevios.length > 0) {
    for (const d of detallesPrevios ?? []) {
      const montos: Record<string, number> = {}
      for (const codigo of codigosManuales) montos[codigo] = 0
      valoresPreviosPorNdt.set(d.ndt_id, {
        horasTrabajadas: d.ndt_horas_ordinarias_diurnas,
        salarioPorHora: d.ndt_salario_por_hora,
        montos,
      })
    }

    const [
      { data: lineasIngresoPrevias, error: errLI },
      { data: lineasDeduccionPrevias, error: errLD },
    ] = await Promise.all([
      supabase
        .from('sgrh_nomina_linea_ingreso')
        .select('ing_nomina_detalle_id, ing_monto, sgrh_cat_conceptos_nomina ( con_codigo )')
        .in('ing_nomina_detalle_id', idsPrevios)
        .returns<LineaIngresoExistenteRow[]>(),
      supabase
        .from('sgrh_nomina_linea_deduccion')
        .select('ded_nomina_detalle_id, ded_monto, sgrh_cat_conceptos_nomina ( con_codigo )')
        .in('ded_nomina_detalle_id', idsPrevios)
        .returns<LineaDeduccionExistenteRow[]>(),
    ])

    if (errLI || errLD) {
      return { ok: false, error: 'No se pudo revisar la planilla existente.' }
    }

    for (const linea of lineasIngresoPrevias ?? []) {
      const codigo = linea.sgrh_cat_conceptos_nomina?.con_codigo
      const previo = valoresPreviosPorNdt.get(linea.ing_nomina_detalle_id)
      if (!previo || !codigo || !(codigo in previo.montos)) continue
      previo.montos[codigo] = linea.ing_monto
    }
    for (const linea of lineasDeduccionPrevias ?? []) {
      const codigo = linea.sgrh_cat_conceptos_nomina?.con_codigo
      const previo = valoresPreviosPorNdt.get(linea.ded_nomina_detalle_id)
      if (!previo || !codigo || !(codigo in previo.montos)) continue
      previo.montos[codigo] = linea.ded_monto
    }
  }

  // 6. Clasificar cada fila del Excel: nueva, sin cambios o actualizada
  const filasNuevas: PlanillaRowInput[] = []
  const filasActualizar: { row: PlanillaRowInput; ndtId: number }[] = []
  let sinCambios = 0

  const labIdsEnExcel = new Set<number>()
  for (const row of rows) {
    const labId = porCedula.get(row.cedula)!.labId
    labIdsEnExcel.add(labId)
    const ndtId = ndtIdPorLab.get(labId)

    if (!ndtId) {
      filasNuevas.push(row)
      continue
    }

    const previo = valoresPreviosPorNdt.get(ndtId)!
    const valoresIguales = sameRowValues(
      {
        horasTrabajadas: previo.horasTrabajadas,
        salarioPorHora: previo.salarioPorHora,
        montos: previo.montos,
      },
      {
        horasTrabajadas: row.horasTrabajadas,
        salarioPorHora: row.salarioPorHora,
        montos: row.montos,
      }
    )

    if (valoresIguales) {
      sinCambios += 1
    } else {
      filasActualizar.push({ row, ndtId })
    }
  }

  // Empleados que ya tenían planilla en el periodo pero salieron del Excel
  const ndtIdsEliminar = (detallesPrevios ?? [])
    .filter((d: DetalleExistenteRow) => !labIdsEnExcel.has(d.ndt_historial_laboral_id))
    .map((d: DetalleExistenteRow) => d.ndt_id)

  // 7. Eliminar lo que salió de la planilla
  if (ndtIdsEliminar.length > 0) {
    const tablasLineas = [
      { tabla: 'sgrh_nomina_linea_ingreso', columna: 'ing_nomina_detalle_id' },
      { tabla: 'sgrh_nomina_linea_deduccion', columna: 'ded_nomina_detalle_id' },
      { tabla: 'sgrh_nomina_linea_patronal', columna: 'pat_nomina_detalle_id' },
    ] as const

    for (const { tabla, columna } of tablasLineas) {
      const { error: errDelLineas } = await supabase
        .from(tabla)
        .delete()
        .in(columna, ndtIdsEliminar)
      if (errDelLineas) {
        return {
          ok: false,
          error: 'No se pudieron eliminar los empleados que salieron de la planilla.',
        }
      }
    }

    const { error: errDelDetalle } = await supabase
      .from('sgrh_nomina_detalle')
      .delete()
      .in('ndt_id', ndtIdsEliminar)
    if (errDelDetalle) {
      return {
        ok: false,
        error: 'No se pudieron eliminar los empleados que salieron de la planilla.',
      }
    }
  }

  // 8. Actualizar los que cambiaron: totales recalculados + líneas desde cero
  for (const { row, ndtId } of filasActualizar) {
    const { salarioBruto, totalDeducciones, salarioNeto, lineas } = calcularPlanillaPorConceptos(
      conceptos,
      {
        montos: row.montos,
        horasTrabajadas: row.horasTrabajadas,
        salarioPorHora: row.salarioPorHora,
      }
    )

    const { error: errUpdate } = await supabase
      .from('sgrh_nomina_detalle')
      .update({
        ndt_salario_bruto: salarioBruto,
        ndt_total_deducciones_obreras: totalDeducciones,
        ndt_salario_neto: salarioNeto,
        ndt_horas_ordinarias_diurnas: row.horasTrabajadas,
        ndt_salario_por_hora: row.salarioPorHora,
      })
      .eq('ndt_id', ndtId)
    if (errUpdate) {
      return { ok: false, error: 'No se pudieron actualizar los montos de la planilla.' }
    }

    const { error: errDelIngreso } = await supabase
      .from('sgrh_nomina_linea_ingreso')
      .delete()
      .eq('ing_nomina_detalle_id', ndtId)
    const { error: errDelDeduccion } = await supabase
      .from('sgrh_nomina_linea_deduccion')
      .delete()
      .eq('ded_nomina_detalle_id', ndtId)
    if (errDelIngreso || errDelDeduccion) {
      return { ok: false, error: 'No se pudieron actualizar las líneas de la planilla.' }
    }

    const { error: errLineas } = await insertarLineas(supabase, ndtId, lineas)
    if (errLineas) {
      return { ok: false, error: errLineas }
    }

    const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
      ndtId,
      historialLaboralId: porCedula.get(row.cedula)!.labId,
      horasTrabajadas: row.horasTrabajadas,
      salarioPorHora: row.salarioPorHora,
    })
    if (errBanco) {
      return { ok: false, error: errBanco }
    }
  }

  // 9. Insertar los empleados nuevos
  if (filasNuevas.length > 0) {
    const hoy = new Date().toISOString().slice(0, 10)
    const totalesPorFila = new Map(
      filasNuevas.map((row) => [
        row.cedula,
        calcularPlanillaPorConceptos(conceptos, {
          montos: row.montos,
          horasTrabajadas: row.horasTrabajadas,
          salarioPorHora: row.salarioPorHora,
        }),
      ])
    )

    const detalles = filasNuevas.map((row) => {
      const totales = totalesPorFila.get(row.cedula)!
      return {
        ndt_nomina_periodo_id: periodoId,
        ndt_historial_laboral_id: porCedula.get(row.cedula)!.labId,
        ndt_salario_bruto: totales.salarioBruto,
        ndt_total_deducciones_obreras: totales.totalDeducciones,
        ndt_total_cargas_patronales: 0,
        ndt_salario_neto: totales.salarioNeto,
        ndt_horas_ordinarias_diurnas: row.horasTrabajadas,
        ndt_salario_por_hora: row.salarioPorHora,
        ndt_fecha_registro: hoy,
      }
    })

    const { data: insertados, error: errInsert } = await supabase
      .from('sgrh_nomina_detalle')
      .insert(detalles)
      .select('ndt_id, ndt_historial_laboral_id')
      .returns<DetalleInsertadoRow[]>()

    if (errInsert || !insertados) {
      return { ok: false, error: 'No se pudieron guardar los detalles de la planilla.' }
    }

    const ndtIdPorLabNuevo = new Map<number, number>(
      insertados.map((d: DetalleInsertadoRow): [number, number] => [
        d.ndt_historial_laboral_id,
        d.ndt_id,
      ])
    )

    for (const row of filasNuevas) {
      const labId = porCedula.get(row.cedula)!.labId
      const ndtId = ndtIdPorLabNuevo.get(labId)
      if (!ndtId) continue

      const { lineas } = totalesPorFila.get(row.cedula)!
      const { error: errLineas } = await insertarLineas(supabase, ndtId, lineas)
      if (errLineas) {
        return {
          ok: false,
          error:
            'Se guardaron los totales, pero fallaron algunas líneas de la planilla. Vuelve a subir el archivo.',
        }
      }

      const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
        ndtId,
        historialLaboralId: labId,
        horasTrabajadas: row.horasTrabajadas,
        salarioPorHora: row.salarioPorHora,
      })
      if (errBanco) {
        return { ok: false, error: errBanco }
      }
    }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${periodoId}`)
  revalidatePath('/payroll/banco-horas')
  return {
    ok: true,
    empleados: rows.length,
    nuevos: filasNuevas.length,
    actualizados: filasActualizar.length,
    sinCambios,
    eliminados: ndtIdsEliminar.length,
  }
}

/**
 * Inserta las líneas de ingreso y deducción calculadas para un ndt_id.
 * Compartido entre "actualizar" e "insertar nuevo" — misma forma que usa
 * updateDetalleManual.ts para la edición manual.
 */
async function insertarLineas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ndtId: number,
  lineas: LineaCalculada[]
): Promise<{ error: string | null }> {
  const ingresos = lineas
    .filter((l) => l.esIngreso)
    .map((l) => ({
      ing_nomina_detalle_id: ndtId,
      ing_concepto_id: l.con_id,
      ing_monto: l.monto,
    }))
  if (ingresos.length > 0) {
    const { error } = await supabase.from('sgrh_nomina_linea_ingreso').insert(ingresos)
    if (error) return { error: 'No se pudieron guardar las líneas de ingreso.' }
  }

  const deducciones = lineas
    .filter((l) => !l.esIngreso)
    .map((l) => ({
      ded_nomina_detalle_id: ndtId,
      ded_concepto_id: l.con_id,
      ded_monto: l.monto,
      ded_porcentaje_aplicado: l.porcentajeAplicado ?? null,
      ded_base_calculo: l.baseCalculo ?? null,
    }))
  if (deducciones.length > 0) {
    const { error } = await supabase.from('sgrh_nomina_linea_deduccion').insert(deducciones)
    if (error) return { error: 'No se pudieron guardar las líneas de deducción.' }
  }

  return { error: null }
}
