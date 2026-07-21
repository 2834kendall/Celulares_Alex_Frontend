'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  computeTotales,
  sameRowValues,
  CONCEPTOS_PLANILLA,
  CCSS_RATE,
  type PlanillaRowInput,
} from '@/modules/payroll/lib/planilla'
import { parsePlanillaWorkbook } from '@/modules/payroll/lib/planillaExcel'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB: la planilla real pesa unos pocos KB

interface ConceptoRow {
  con_id: number
  con_codigo: string
}

interface DetalleExistenteRow {
  ndt_id: number
  ndt_historial_laboral_id: number
}

interface LineaIngresoExistenteRow {
  ing_nomina_detalle_id: number
  ing_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string } | null
}

interface DetalleInsertadoRow {
  ndt_id: number
  ndt_historial_laboral_id: number
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

type MontosPorConcepto = Record<(typeof CONCEPTOS_PLANILLA.ingresos)[number], number>

function montosDeFila(row: PlanillaRowInput): MontosPorConcepto {
  return {
    BASE: row.base,
    FERIADO: row.feriado,
    COMISION: row.comision,
    HORAS_EXTRA: row.horasExtra,
    AJUSTE: row.ajuste,
  }
}

/** Ingresos (>0) y la deducción de CCSS para un ndt_id ya existente, listos para insertar. */
function construirLineas(row: PlanillaRowInput, ndtId: number, conceptoId: Map<string, number>) {
  const montos = montosDeFila(row)
  const ingresos = CONCEPTOS_PLANILLA.ingresos
    .filter((codigo) => montos[codigo] > 0)
    .map((codigo) => ({
      ing_nomina_detalle_id: ndtId,
      ing_concepto_id: conceptoId.get(codigo)!,
      ing_monto: montos[codigo],
    }))

  const totales = computeTotales(row)
  const deduccion = {
    ded_nomina_detalle_id: ndtId,
    ded_concepto_id: conceptoId.get(CONCEPTOS_PLANILLA.deduccion)!,
    ded_porcentaje_aplicado: CCSS_RATE * 100,
    ded_base_calculo: totales.salarioBruto,
    ded_monto: totales.deduccionCcss,
  }

  return { ingresos, deduccion }
}

/**
 * Sube la planilla llena y la sincroniza con el periodo (solo en borrador).
 * En vez de reemplazar todo, compara cada fila del Excel contra lo ya
 * guardado: si un empleado no cambió se deja intacto (no se toca su ndt_id,
 * ndt_pagado ni fechas); solo se inserta, actualiza o elimina lo que
 * realmente cambió. Los totales SIEMPRE se recalculan en el servidor (bruto,
 * CCSS 10,83%, neto); no se confía en las fórmulas del Excel.
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

  // 2. Leer y validar el Excel
  const { rows, errors } = await parsePlanillaWorkbook(await file.arrayBuffer())

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

  // 3. Resolver cédulas contra los contratos activos de la sucursal
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

  // 4. Conceptos del catálogo
  const codigos = [...CONCEPTOS_PLANILLA.ingresos, CONCEPTOS_PLANILLA.deduccion]
  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select('con_id, con_codigo')
    .in('con_codigo', codigos)
    .returns<ConceptoRow[]>()

  if (errConceptos) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }

  const conceptoId = new Map<string, number>(
    (conceptos ?? []).map((c: ConceptoRow): [string, number] => [c.con_codigo, c.con_id])
  )
  const faltantes = codigos.filter((c) => !conceptoId.has(c))
  if (faltantes.length > 0) {
    return {
      ok: false,
      error: `Faltan conceptos en el catálogo (${faltantes.join(', ')}). Créalos en "Conceptos de nómina" antes de subir la planilla.`,
    }
  }

  // 5. Planilla ya guardada en el periodo (para comparar, no para borrar de una vez)
  const { data: detallesPrevios, error: errPrevios } = await supabase
    .from('sgrh_nomina_detalle')
    .select('ndt_id, ndt_historial_laboral_id')
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

  // Ingresos de cada ndt_id previo, para reconstruir los montos crudos que ya
  // había (los códigos ausentes cuentan como 0, igual que un campo vacío del Excel).
  const valoresPreviosPorNdt = new Map<number, MontosPorConcepto>()
  if (idsPrevios.length > 0) {
    const { data: lineasPrevias, error: errLineas } = await supabase
      .from('sgrh_nomina_linea_ingreso')
      .select('ing_nomina_detalle_id, ing_monto, sgrh_cat_conceptos_nomina ( con_codigo )')
      .in('ing_nomina_detalle_id', idsPrevios)
      .returns<LineaIngresoExistenteRow[]>()

    if (errLineas) {
      return { ok: false, error: 'No se pudo revisar la planilla existente.' }
    }

    for (const ndtId of idsPrevios) {
      valoresPreviosPorNdt.set(ndtId, {
        BASE: 0,
        FERIADO: 0,
        COMISION: 0,
        HORAS_EXTRA: 0,
        AJUSTE: 0,
      })
    }
    for (const linea of lineasPrevias ?? []) {
      const codigo = linea.sgrh_cat_conceptos_nomina?.con_codigo
      const montos = valoresPreviosPorNdt.get(linea.ing_nomina_detalle_id)
      if (!montos || !codigo) continue
      if ((CONCEPTOS_PLANILLA.ingresos as readonly string[]).includes(codigo)) {
        montos[codigo as (typeof CONCEPTOS_PLANILLA.ingresos)[number]] = linea.ing_monto
      }
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

    const montosNuevos = montosDeFila(row)
    const montosPrevios = valoresPreviosPorNdt.get(ndtId)!
    const valoresIguales = sameRowValues(
      {
        base: montosPrevios.BASE,
        feriado: montosPrevios.FERIADO,
        comision: montosPrevios.COMISION,
        horasExtra: montosPrevios.HORAS_EXTRA,
        ajuste: montosPrevios.AJUSTE,
      },
      {
        base: montosNuevos.BASE,
        feriado: montosNuevos.FERIADO,
        comision: montosNuevos.COMISION,
        horasExtra: montosNuevos.HORAS_EXTRA,
        ajuste: montosNuevos.AJUSTE,
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
    const totales = computeTotales(row)
    const { error: errUpdate } = await supabase
      .from('sgrh_nomina_detalle')
      .update({
        ndt_salario_bruto: totales.salarioBruto,
        ndt_total_deducciones_obreras: totales.deduccionCcss,
        ndt_salario_neto: totales.salarioNeto,
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

    const { ingresos, deduccion } = construirLineas(row, ndtId, conceptoId)
    if (ingresos.length > 0) {
      const { error: errIngreso } = await supabase
        .from('sgrh_nomina_linea_ingreso')
        .insert(ingresos)
      if (errIngreso) {
        return { ok: false, error: 'No se pudieron guardar las líneas de ingreso actualizadas.' }
      }
    }
    const { error: errDeduccion } = await supabase
      .from('sgrh_nomina_linea_deduccion')
      .insert(deduccion)
    if (errDeduccion) {
      return { ok: false, error: 'No se pudo guardar la deducción actualizada.' }
    }
  }

  // 9. Insertar los empleados nuevos
  if (filasNuevas.length > 0) {
    const hoy = new Date().toISOString().slice(0, 10)
    const detalles = filasNuevas.map((row) => {
      const totales = computeTotales(row)
      return {
        ndt_nomina_periodo_id: periodoId,
        ndt_historial_laboral_id: porCedula.get(row.cedula)!.labId,
        ndt_salario_bruto: totales.salarioBruto,
        ndt_total_deducciones_obreras: totales.deduccionCcss,
        ndt_total_cargas_patronales: 0,
        ndt_salario_neto: totales.salarioNeto,
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

    const ingresosNuevos: {
      ing_nomina_detalle_id: number
      ing_concepto_id: number
      ing_monto: number
    }[] = []
    const deduccionesNuevas: {
      ded_nomina_detalle_id: number
      ded_concepto_id: number
      ded_porcentaje_aplicado: number
      ded_base_calculo: number
      ded_monto: number
    }[] = []

    for (const row of filasNuevas) {
      const labId = porCedula.get(row.cedula)!.labId
      const ndtId = ndtIdPorLabNuevo.get(labId)
      if (!ndtId) continue

      const { ingresos, deduccion } = construirLineas(row, ndtId, conceptoId)
      ingresosNuevos.push(...ingresos)
      deduccionesNuevas.push(deduccion)
    }

    if (ingresosNuevos.length > 0) {
      const { error: errIngresos } = await supabase
        .from('sgrh_nomina_linea_ingreso')
        .insert(ingresosNuevos)
      if (errIngresos) {
        return {
          ok: false,
          error:
            'Se guardaron los totales, pero fallaron las líneas de ingreso. Vuelve a subir el archivo.',
        }
      }
    }

    if (deduccionesNuevas.length > 0) {
      const { error: errDeducciones } = await supabase
        .from('sgrh_nomina_linea_deduccion')
        .insert(deduccionesNuevas)
      if (errDeducciones) {
        return {
          ok: false,
          error:
            'Se guardaron los totales, pero fallaron las deducciones. Vuelve a subir el archivo.',
        }
      }
    }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${periodoId}`)
  return {
    ok: true,
    empleados: rows.length,
    nuevos: filasNuevas.length,
    actualizados: filasActualizar.length,
    sinCambios,
    eliminados: ndtIdsEliminar.length,
  }
}
