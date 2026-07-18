'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { computeTotales, CONCEPTOS_PLANILLA, CCSS_RATE } from '@/modules/payroll/lib/planilla'
import { parsePlanillaWorkbook } from '@/modules/payroll/lib/planillaExcel'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB: la planilla real pesa unos pocos KB

interface ConceptoRow {
  con_id: number
  con_codigo: string
}

interface DetalleInsertadoRow {
  ndt_id: number
  ndt_historial_laboral_id: number
}

export type UploadPlanillaResult = { ok: true; empleados: number } | { ok: false; error: string }

/**
 * Sube la planilla llena y la guarda en el periodo (solo en estado borrador).
 * Reemplaza por completo la planilla anterior del periodo: borra los detalles
 * y líneas existentes y los vuelve a crear desde el Excel — así re-subir el
 * archivo corrige errores sin duplicar. Los totales SIEMPRE se recalculan en
 * el servidor (bruto, CCSS 10,83%, neto); no se confía en las fórmulas del Excel.
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

  // 4. Conceptos del catálogo (requiere el seed sgrh_conceptos_nomina_seed.sql)
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
    (conceptos ?? []).map((c): [string, number] => [c.con_codigo, c.con_id])
  )
  const faltantes = codigos.filter((c) => !conceptoId.has(c))
  if (faltantes.length > 0) {
    return {
      ok: false,
      error: `Faltan conceptos en el catálogo (${faltantes.join(', ')}). Corre el seed sgrh_conceptos_nomina_seed.sql en Supabase.`,
    }
  }

  // 5. Limpiar la planilla anterior del periodo (líneas primero por las FK)
  const { data: detallesPrevios, error: errPrevios } = await supabase
    .from('sgrh_nomina_detalle')
    .select('ndt_id')
    .eq('ndt_nomina_periodo_id', periodoId)

  if (errPrevios) {
    return { ok: false, error: 'No se pudo revisar la planilla existente.' }
  }

  const idsPrevios = (detallesPrevios ?? []).map((d) => d.ndt_id)
  if (idsPrevios.length > 0) {
    const tablasLineas = [
      { tabla: 'sgrh_nomina_linea_ingreso', columna: 'ing_nomina_detalle_id' },
      { tabla: 'sgrh_nomina_linea_deduccion', columna: 'ded_nomina_detalle_id' },
      { tabla: 'sgrh_nomina_linea_patronal', columna: 'pat_nomina_detalle_id' },
    ] as const

    for (const { tabla, columna } of tablasLineas) {
      const { error: errLineas } = await supabase.from(tabla).delete().in(columna, idsPrevios)
      if (errLineas) {
        return { ok: false, error: 'No se pudo limpiar la planilla anterior.' }
      }
    }

    const { error: errDetalles } = await supabase
      .from('sgrh_nomina_detalle')
      .delete()
      .eq('ndt_nomina_periodo_id', periodoId)
    if (errDetalles) {
      return { ok: false, error: 'No se pudo limpiar la planilla anterior.' }
    }
  }

  // 6. Insertar los detalles recalculados
  const hoy = new Date().toISOString().slice(0, 10)
  const detalles = rows.map((row) => {
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

  // 7. Líneas por concepto (ingresos > 0 + rebajo CCSS)
  const detallePorLab = new Map<number, number>(
    insertados.map((d): [number, number] => [d.ndt_historial_laboral_id, d.ndt_id])
  )
  const ingresos: {
    ing_nomina_detalle_id: number
    ing_concepto_id: number
    ing_monto: number
  }[] = []
  const deducciones: {
    ded_nomina_detalle_id: number
    ded_concepto_id: number
    ded_porcentaje_aplicado: number
    ded_base_calculo: number
    ded_monto: number
  }[] = []

  for (const row of rows) {
    const labId = porCedula.get(row.cedula)!.labId
    const ndtId = detallePorLab.get(labId)
    if (!ndtId) continue

    const montos: Record<(typeof CONCEPTOS_PLANILLA.ingresos)[number], number> = {
      BASE: row.base,
      FERIADO: row.feriado,
      COMISION: row.comision,
      HORAS_EXTRA: row.horasExtra,
      AJUSTE: row.ajuste,
    }

    for (const codigo of CONCEPTOS_PLANILLA.ingresos) {
      if (montos[codigo] > 0) {
        ingresos.push({
          ing_nomina_detalle_id: ndtId,
          ing_concepto_id: conceptoId.get(codigo)!,
          ing_monto: montos[codigo],
        })
      }
    }

    const totales = computeTotales(row)
    deducciones.push({
      ded_nomina_detalle_id: ndtId,
      ded_concepto_id: conceptoId.get(CONCEPTOS_PLANILLA.deduccion)!,
      ded_porcentaje_aplicado: CCSS_RATE * 100,
      ded_base_calculo: totales.salarioBruto,
      ded_monto: totales.deduccionCcss,
    })
  }

  if (ingresos.length > 0) {
    const { error: errIngresos } = await supabase.from('sgrh_nomina_linea_ingreso').insert(ingresos)
    if (errIngresos) {
      return {
        ok: false,
        error:
          'Se guardaron los totales, pero fallaron las líneas de ingreso. Vuelve a subir el archivo.',
      }
    }
  }

  const { error: errDeducciones } = await supabase
    .from('sgrh_nomina_linea_deduccion')
    .insert(deducciones)
  if (errDeducciones) {
    return {
      ok: false,
      error: 'Se guardaron los totales, pero fallaron las deducciones. Vuelve a subir el archivo.',
    }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${periodoId}`)
  return { ok: true, empleados: rows.length }
}
