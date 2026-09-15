'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  ERROR_SIN_CONCEPTO_BASE,
  calcularPlanillaPorConceptos,
  hayConceptoSalarioBase,
  type ConceptoCalculo,
} from '@/modules/payroll/lib/planilla'
import { CAMPOS_CONCEPTO_DE_LINEA } from '@/modules/payroll/lib/lineasAjenas'
import { reemplazarLineasDetalle } from '@/modules/payroll/lib/lineasNomina'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'
import { lecturaUtilizable } from '@/modules/payroll/lib/horasPeriodo'
import { prellenarDesdeAsistencia } from '@/modules/payroll/lib/prellenadoAsistencia'
import { camposFotoAsistencia } from '@/modules/payroll/lib/horasOrigen'
import { ahoraLocal, hoyLocal } from '@/modules/payroll/lib/fechas'
import { sincronizarMovimientoBancoHoras } from '@/modules/payroll/lib/bancoHorasAccrual'

export type CargarEmpleadosResult =
  | {
      ok: true
      agregados: number
      yaEstaban: number
      sinAsistencia: number
      /** Nombres de quienes quedarían en ₡0 por no tener salario en su contrato. */
      sinSalario: string[]
    }
  | { ok: false; error: string }

interface PeriodoRow {
  npe_id: number
  npe_estado: string
  npe_sucursal_id: number
  npe_fecha_inicio_periodo: string | null
  npe_fecha_fin_periodo: string | null
}

interface DetalleInsertadoRow {
  ndt_id: number
  ndt_historial_laboral_id: number
}

/**
 * Llena el periodo con los empleados activos de la sucursal, con las horas que
 * dicen las marcas del kiosco.
 *
 * Hasta ahora crear un periodo dejaba una cabecera vacía y la ÚNICA forma de
 * meterle gente era descargar la plantilla de Excel y volver a subirla. Quien
 * no conocía ese paso veía un periodo en blanco y nada que se lo explicara: la
 * asistencia estaba registrada, pero la planilla no la iba a buscar nunca.
 *
 * Esto es exactamente lo que produce ese viaje por el archivo —misma lectura de
 * marcas y mismo prellenado (ver lib/prellenadoAsistencia.ts)— pero directo.
 * El Excel sigue existiendo para lo que es bueno: revisar y corregir montos en
 * bloque antes de guardarlos.
 *
 * Solo AGREGA. A quien ya está en el periodo no se le toca ni una cifra: sus
 * montos pueden estar editados a mano y rehacerlos sería borrar ese trabajo.
 * Para actualizarle las horas a alguien que ya está, el botón "traer … h" de su
 * fila (ver refrescarHorasAsistencia).
 */
export async function cargarEmpleadosDesdeAsistencia(
  periodoId: number
): Promise<CargarEmpleadosResult> {
  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return { ok: false, error: 'Periodo inválido.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const usuarioId = (claims.app_metadata as { usr_id?: number })?.usr_id ?? null
  const supabase = await createClient()

  const { data: periodo, error: errPeriodo } = await supabase
    .from('sgrh_nomina_periodo')
    .select('npe_id, npe_estado, npe_sucursal_id, npe_fecha_inicio_periodo, npe_fecha_fin_periodo')
    .eq('npe_id', periodoId)
    .maybeSingle<PeriodoRow>()

  if (errPeriodo) {
    return { ok: false, error: 'No se pudo cargar el periodo.' }
  }
  if (!periodo) {
    return { ok: false, error: 'El periodo no existe o no es visible.' }
  }
  if (periodo.npe_estado !== 'borrador') {
    return { ok: false, error: 'Solo se puede cargar empleados en un periodo en borrador.' }
  }

  const empleadosResult = await getEmpleadosActivos(supabase, periodo.npe_sucursal_id)
  if (!empleadosResult.ok) {
    return { ok: false, error: empleadosResult.error }
  }
  if (empleadosResult.data.length === 0) {
    return {
      ok: false,
      error: 'La sucursal de este periodo no tiene empleados con contrato activo.',
    }
  }

  const { data: yaEnPeriodo, error: errExistentes } = await supabase
    .from('sgrh_nomina_detalle')
    .select('ndt_historial_laboral_id')
    .eq('ndt_nomina_periodo_id', periodoId)
    .returns<{ ndt_historial_laboral_id: number }[]>()

  if (errExistentes) {
    return { ok: false, error: 'No se pudo revisar quién ya está en el periodo.' }
  }

  const existentes = new Set((yaEnPeriodo ?? []).map((d) => d.ndt_historial_laboral_id))
  const faltantes = empleadosResult.data.filter((e) => !existentes.has(e.labId))

  if (faltantes.length === 0) {
    return { ok: true, agregados: 0, yaEstaban: existentes.size, sinAsistencia: 0, sinSalario: [] }
  }

  // Un contrato sin salario produce una fila con horas y ₡0 a pagar, que es
  // exactamente el tipo de cifra que nadie revisa hasta que el empleado
  // reclama. No se carga: se nombra a quién le falta el dato.
  const sinSalario = faltantes.filter((e) => !(e.salarioBaseMensual > 0)).map((e) => e.nombre)

  const conSalario = faltantes.filter((e) => e.salarioBaseMensual > 0)

  if (conSalario.length === 0) {
    return {
      ok: false,
      error: `Ningún empleado por agregar tiene salario base en su contrato (${sinSalario.slice(0, 5).join(', ')}). Corregilo en Historial Laboral y volvé a intentarlo.`,
    }
  }

  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select(CAMPOS_CONCEPTO_DE_LINEA)
    .eq('con_activo', true)
    .returns<ConceptoCalculo[]>()

  if (errConceptos) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }
  if (!conceptos || conceptos.length === 0) {
    return {
      ok: false,
      error: 'No hay conceptos activos en el catálogo. Creá al menos uno en "Conceptos de nómina".',
    }
  }
  // Sin el concepto BASE todas las filas nacerían en ₡0 con las horas bien
  // puestas. Cargar la planilla entera así es peor que no cargarla.
  if (!hayConceptoSalarioBase(conceptos)) {
    return { ok: false, error: ERROR_SIN_CONCEPTO_BASE }
  }

  // Sin fechas no hay marcas que leer: las filas salen con el supuesto de
  // jornada completa, igual que la plantilla. No es motivo para no cargarlas.
  const conFechas = Boolean(periodo.npe_fecha_inicio_periodo && periodo.npe_fecha_fin_periodo)
  const lectura = conFechas
    ? await getHorasDelPeriodo(supabase, {
        historialLaboralIds: conSalario.map((e) => e.labId),
        fechaInicio: periodo.npe_fecha_inicio_periodo!,
        fechaFin: periodo.npe_fecha_fin_periodo!,
      })
    : null

  if (lectura && !lectura.ok) {
    return { ok: false, error: lectura.error }
  }
  const horasPorLab = lectura?.ok ? lectura.data : null

  const ahora = ahoraLocal()
  const hoy = hoyLocal()
  let sinAsistencia = 0

  const calculado = conSalario.map((empleado) => {
    // Ojo: getHorasDelPeriodo SIEMPRE devuelve una entrada por contrato, aunque
    // sea de ceros. Lo que decide si sirve es que tenga horas programadas (ver
    // lecturaUtilizable): un empleado sin horario asignado, o un usuario sin
    // permiso para ver la asistencia, llegan acá igual y con ceros.
    const leido = horasPorLab?.get(empleado.labId) ?? null
    const totales = lecturaUtilizable(leido) ? leido : null
    if (!totales) sinAsistencia += 1

    const fila = prellenarDesdeAsistencia(
      empleado.salarioBaseMensual,
      totales,
      empleado.horasSemanales
    )
    const montos: Record<string, number> = { BASE: fila.base }

    const resultado = calcularPlanillaPorConceptos(conceptos, {
      montos,
      horasTrabajadas: fila.horas,
      horasExtra: fila.horasExtra,
      salarioPorHora: fila.salarioPorHora,
    })

    // Fila nueva: no hay nada anterior contra lo cual comparar, y lo que se
    // guarda ES lo que dicen las marcas.
    const foto = camposFotoAsistencia({
      lectura: totales
        ? { estado: 'ok', datos: { horas: fila.horas, horasExtra: fila.horasExtra } }
        : { estado: 'sin_fechas' },
      guardadas: { horas: fila.horas, horasExtra: fila.horasExtra },
      guardadasPrevias: null,
      fotoPrevia: { horas: null, horasExtra: null },
      usuarioId,
      ahora,
    })

    return { empleado, fila, resultado, foto }
  })

  const { data: insertados, error: errInsert } = await supabase
    .from('sgrh_nomina_detalle')
    .insert(
      calculado.map(({ empleado, fila, resultado, foto }) => ({
        ndt_nomina_periodo_id: periodoId,
        ndt_historial_laboral_id: empleado.labId,
        ndt_salario_bruto: resultado.salarioBruto,
        ndt_total_deducciones_obreras: resultado.totalDeducciones,
        ndt_total_cargas_patronales: resultado.totalCargasPatronales,
        ndt_salario_neto: resultado.salarioNeto,
        ndt_horas_ordinarias_diurnas: fila.horas,
        ndt_horas_extra_al_50: fila.horasExtra,
        ndt_salario_por_hora: fila.salarioPorHora,
        ndt_fecha_registro: hoy,
        ...(foto.escribir ? foto.campos : {}),
      }))
    )
    .select('ndt_id, ndt_historial_laboral_id')
    .returns<DetalleInsertadoRow[]>()

  if (errInsert || !insertados) {
    return { ok: false, error: 'No se pudieron crear las filas de la planilla.' }
  }

  const ndtPorLab = new Map(insertados.map((d) => [d.ndt_historial_laboral_id, d.ndt_id]))

  for (const { empleado, fila, resultado } of calculado) {
    const ndtId = ndtPorLab.get(empleado.labId)
    if (!ndtId) continue

    const { error: errLineas } = await reemplazarLineasDetalle(
      supabase,
      ndtId,
      resultado.lineas,
      resultado.lineasPatronales
    )
    if (errLineas) {
      return { ok: false, error: errLineas }
    }

    // Las horas por encima del tope quedan pendientes en el banco de horas, no
    // se pagan solas acá.
    const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
      ndtId,
      historialLaboralId: empleado.labId,
      horasExtra: fila.horasExtra,
      salarioPorHora: fila.salarioPorHora,
    })
    if (errBanco) {
      return { ok: false, error: errBanco }
    }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${periodoId}`)
  revalidatePath('/payroll/banco-horas')

  return {
    ok: true,
    agregados: insertados.length,
    yaEstaban: existentes.size,
    sinAsistencia,
    sinSalario,
  }
}
