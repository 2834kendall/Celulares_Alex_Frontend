'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { editarDetalleSchema, type EditarDetalleInput } from '@/modules/payroll/types'
import {
  CODIGO_AJUSTE,
  CODIGO_SALARIO_BASE,
  ERROR_SIN_CONCEPTO_AJUSTE,
  calcularPlanillaPorConceptos,
  hayConceptoAjuste,
  type ConceptoCalculo,
} from '@/modules/payroll/lib/planilla'
import {
  baseParaHorasEditadas,
  prellenarDesdeAsistencia,
} from '@/modules/payroll/lib/prellenadoAsistencia'
import { reemplazarLineasDetalle } from '@/modules/payroll/lib/lineasNomina'
import {
  CAMPOS_CONCEPTO_DE_LINEA,
  fusionarAjenas,
  leerMontosGuardados,
} from '@/modules/payroll/lib/lineasAjenas'
import { getFotoAsistencia } from '@/modules/payroll/lib/horasPeriodoData'
import { camposFotoAsistencia } from '@/modules/payroll/lib/horasOrigen'
import { ahoraLocal } from '@/modules/payroll/lib/fechas'
import { sincronizarMovimientoBancoHoras } from '@/modules/payroll/lib/bancoHorasAccrual'

interface DetalleActualRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  ndt_historial_laboral_id: number
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_horas_asistencia: number | null
  ndt_horas_extra_asistencia: number | null
  sgrh_nomina_periodo: {
    npe_estado: string
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_quincena: number
    npe_fecha_inicio_periodo: string | null
    npe_fecha_fin_periodo: string | null
  } | null
}

interface ContratoRow {
  lab_salario_base: number | null
  lab_salario_real: number | null
  sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: number | null } | null
}

export type UpdateDetalleManualResult = { ok: true } | { ok: false; error: string }

/**
 * Guarda la edición manual del detalle de un empleado dentro del periodo:
 * recalcula bruto/deducciones/neto a partir de los conceptos activos del
 * catálogo (calcularPlanillaPorConceptos) y reemplaza las líneas de ingreso
 * y deducción desde cero. Solo se permite mientras el periodo está en
 * borrador, igual que la subida de Excel.
 */
export async function updateDetalleManual(
  ndtId: number,
  input: EditarDetalleInput
): Promise<UpdateDetalleManualResult> {
  if (!Number.isInteger(ndtId) || ndtId <= 0) {
    return { ok: false, error: 'Detalle inválido.' }
  }

  const parsed = editarDetalleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const usuarioId = (claims.app_metadata as { usr_id?: number })?.usr_id ?? null
  const supabase = await createClient()

  const { data: detalle, error: errDetalle } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `ndt_id, ndt_nomina_periodo_id, ndt_historial_laboral_id,
       ndt_horas_ordinarias_diurnas, ndt_horas_extra_al_50,
       ndt_horas_asistencia, ndt_horas_extra_asistencia,
       sgrh_nomina_periodo (
         npe_estado, npe_periodo_mes, npe_periodo_anio, npe_quincena,
         npe_fecha_inicio_periodo, npe_fecha_fin_periodo
       )`
    )
    .eq('ndt_id', ndtId)
    .maybeSingle<DetalleActualRow>()

  if (errDetalle) {
    return { ok: false, error: 'No se pudo cargar el detalle de la planilla.' }
  }
  if (!detalle) {
    return { ok: false, error: 'El detalle no existe o no es visible.' }
  }
  if (detalle.sgrh_nomina_periodo?.npe_estado !== 'borrador') {
    return {
      ok: false,
      error: 'Solo se puede editar la planilla mientras el periodo está en borrador.',
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
      error: 'No hay conceptos activos en el catálogo. Crea al menos uno en "Conceptos de nómina".',
    }
  }

  // Líneas guardadas de conceptos que el formulario NO edita porque no están
  // activos en el catálogo. El caso real es HORAS_EXTRA, con el que se paga el
  // banco de horas: sin esto, abrir la fila de alguien a quien se le acababa
  // de pagar el banco y darle guardar —aunque no se cambiara nada— borraba ese
  // pago y le bajaba el bruto, mientras el movimiento seguía diciendo
  // "pagado". Ver lib/lineasAjenas.ts.
  const { ajenas, error: errAjenas } = await leerMontosGuardados(supabase, ndtId, conceptos)
  if (errAjenas) {
    return { ok: false, error: errAjenas }
  }

  // Foto de lo que dicen las marcas ahora mismo. Editar el detalle es una de
  // las dos formas de corregir las horas a mano, así que acá también queda
  // registrado si lo que se guarda difiere de la asistencia (ver
  // lib/horasOrigen.ts).
  const lecturaPeriodo = await getFotoAsistencia(supabase, {
    historialLaboralIds: [detalle.ndt_historial_laboral_id],
    fechaInicio: detalle.sgrh_nomina_periodo?.npe_fecha_inicio_periodo ?? null,
    fechaFin: detalle.sgrh_nomina_periodo?.npe_fecha_fin_periodo ?? null,
  })

  // Desde que las marcas son la fuente de las horas, guardar sin poder leerlas
  // deja la fila a medias: horas nuevas con una foto vieja, que es justamente
  // el par con el que después se decide si alguien las corrigió y si el pago
  // se bloquea. Mejor no guardar y pedir que se reintente.
  if (lecturaPeriodo.estado === 'error') {
    return {
      ok: false,
      error: 'No se pudieron leer las marcas de asistencia del periodo. Volvé a intentarlo.',
    }
  }

  const marcas =
    lecturaPeriodo.estado === 'ok'
      ? (lecturaPeriodo.datos.get(detalle.ndt_historial_laboral_id) ?? null)
      : null

  // El AJUSTE no se digita: se recalcula con las horas que se están guardando
  // y el cumplimiento del horario (ver lib/prellenadoAsistencia.ts). Lo que
  // venga en el formulario para ese concepto se ignora.
  if (!hayConceptoAjuste(conceptos)) {
    return { ok: false, error: ERROR_SIN_CONCEPTO_AJUSTE }
  }
  const { data: contrato, error: errContrato } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      'lab_salario_base, lab_salario_real, sgrh_cat_tipos_jornada ( tjo_horas_max_semanales )'
    )
    .eq('lab_id', detalle.ndt_historial_laboral_id)
    .maybeSingle<ContratoRow>()
  if (errContrato || !contrato) {
    return { ok: false, error: 'No se pudo cargar el contrato del empleado.' }
  }
  const lecturaCompleta =
    lecturaPeriodo.estado === 'ok'
      ? (lecturaPeriodo.totales.get(detalle.ndt_historial_laboral_id) ?? null)
      : null
  const periodo = detalle.sgrh_nomina_periodo
  const contratoPago = {
    salarioBaseMensual: contrato.lab_salario_base ?? 0,
    salarioRealMensual: contrato.lab_salario_real ?? null,
    horasSemanales: contrato.sgrh_cat_tipos_jornada?.tjo_horas_max_semanales ?? null,
  }
  const quincena = {
    anio: periodo.npe_periodo_anio,
    mes: periodo.npe_periodo_mes,
    quincena: periodo.npe_quincena,
  }
  const horasNuevas = { horas: parsed.data.horasTrabajadas, horasExtra: parsed.data.horasExtra }
  const ajuste = prellenarDesdeAsistencia(
    contratoPago,
    lecturaCompleta
      ? {
          ...lecturaCompleta,
          horasOrdinarias: horasNuevas.horas,
          horasExtra: horasNuevas.horasExtra,
        }
      : null,
    quincena
  ).ajuste
  // Si cambiaron las horas y el BASE es el que había puesto el sistema, sigue
  // a las horas nuevas; uno corregido a mano se respeta.
  const base = baseParaHorasEditadas({
    baseIngresado: parsed.data.montos[CODIGO_SALARIO_BASE] ?? 0,
    contrato: contratoPago,
    lectura: lecturaCompleta,
    horasPrevias: {
      horas: detalle.ndt_horas_ordinarias_diurnas,
      horasExtra: detalle.ndt_horas_extra_al_50 ?? 0,
    },
    horasNuevas,
    quincena,
  }).base

  const { conceptos: conceptosCalculo, montos } = fusionarAjenas(
    conceptos,
    { ...parsed.data.montos, [CODIGO_SALARIO_BASE]: base, [CODIGO_AJUSTE]: ajuste },
    ajenas
  )

  const {
    salarioBruto,
    totalDeducciones,
    salarioNeto,
    totalCargasPatronales,
    lineas,
    lineasPatronales,
  } = calcularPlanillaPorConceptos(conceptosCalculo, { ...parsed.data, montos })

  const foto = camposFotoAsistencia({
    lectura: lecturaPeriodo.estado === 'ok' ? { estado: 'ok', datos: marcas } : lecturaPeriodo,
    guardadas: { horas: parsed.data.horasTrabajadas, horasExtra: parsed.data.horasExtra },
    guardadasPrevias: {
      horas: detalle.ndt_horas_ordinarias_diurnas,
      horasExtra: detalle.ndt_horas_extra_al_50 ?? 0,
    },
    fotoPrevia: {
      horas: detalle.ndt_horas_asistencia ?? null,
      horasExtra: detalle.ndt_horas_extra_asistencia ?? null,
    },
    usuarioId,
    ahora: ahoraLocal(),
  })

  // Las horas que llegan son las mismas que ya estaban y las marcas dicen otra
  // cosa: guardar esto no cambiaría nada y dejaría la fila igual de
  // desactualizada. Se dice en voz alta, en vez de devolver ok sin haber hecho
  // nada — eso era peor, el encargado creía que había destrabado el pago.
  if (!foto.escribir) {
    return {
      ok: false,
      error: `Las marcas de este empleado cambiaron y ahora dicen ${marcas?.horas ?? 0} h (${marcas?.horasExtra ?? 0} h extra), pero las horas que estás guardando son las mismas de antes. Poné las horas que corresponden y volvé a guardar.`,
    }
  }

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_salario_bruto: salarioBruto,
      ndt_total_deducciones_obreras: totalDeducciones,
      ndt_salario_neto: salarioNeto,
      ndt_total_cargas_patronales: totalCargasPatronales,
      ndt_horas_ordinarias_diurnas: parsed.data.horasTrabajadas,
      ndt_horas_extra_al_50: parsed.data.horasExtra,
      ndt_salario_por_hora: parsed.data.salarioPorHora,
      ...foto.campos,
    })
    .eq('ndt_id', ndtId)
  if (errUpdate) {
    return { ok: false, error: 'No se pudieron guardar los montos.' }
  }

  const { error: errLineas } = await reemplazarLineasDetalle(
    supabase,
    ndtId,
    lineas,
    lineasPatronales
  )
  if (errLineas) {
    return { ok: false, error: errLineas }
  }

  // Si las horas trabajadas pasan del tope normal, esas horas de más quedan
  // pendientes en el banco de horas (ya no se pagan solas aquí).
  const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
    ndtId,
    historialLaboralId: detalle.ndt_historial_laboral_id,
    horasExtra: parsed.data.horasExtra,
    salarioPorHora: parsed.data.salarioPorHora,
  })
  if (errBanco) {
    return { ok: false, error: errBanco }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${detalle.ndt_nomina_periodo_id}`)
  revalidatePath('/payroll/banco-horas')
  return { ok: true }
}
