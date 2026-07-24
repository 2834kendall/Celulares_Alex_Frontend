'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  anioCicloAguinaldo,
  calcularLiquidacion,
  calcularMesesAntiguedad,
} from '@/modules/payroll/lib/liquidacion'
import {
  procesarLiquidacionSchema,
  type LiquidacionCalculada,
  type ProcesarLiquidacionInput,
} from '@/modules/payroll/types'

export type ProcesarLiquidacionResult =
  { ok: true; data: LiquidacionCalculada } | { ok: false; error: string }

interface HistorialRow {
  lab_id: number
  lab_fecha_inicio: string
  lab_fecha_fin: string | null
  lab_salario_real: number
}

interface MotivoRow {
  mot_id: number
  mot_genera_cesantia: boolean
  mot_genera_preaviso: boolean
}

interface DetalleHistoricoRow {
  ndt_salario_bruto: number
  ndt_pagado: boolean
  sgrh_nomina_periodo: {
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_quincena: number
  } | null
}

/** Interpreta 'YYYY-MM-DD' en horario local (evita el corrimiento de Date por UTC). */
function parseFechaLocal(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/**
 * Clave comparable a nivel de quincena (no solo mes) para poder ordenar y
 * filtrar periodos correctamente cuando hay dos quincenas en el mismo mes.
 */
function claveQuincenal(anio: number, mes: number, quincena: number): number {
  return (anio * 12 + mes) * 2 + (quincena - 1)
}

/**
 * Calcula la liquidación de un empleado y la deja guardada en
 * sgrh_liquidaciones (registro auditable, no se puede procesar dos veces
 * para el mismo contrato). También cierra el expediente laboral
 * (lab_fecha_fin, lab_motivo_salida_id).
 *
 * El salario diario usado en todos los rubros es el promedio bruto de los
 * últimos 6 pagos de nómina de este empleado ÷ 30 (o el salario del
 * contrato si todavía no tiene historial de pagos). El aguinaldo
 * proporcional se recalcula desde el historial real de pagos del ciclo
 * diciembre-noviembre en curso, no desde la provisión acumulada, para que
 * sea correcto aunque la provisión tenga huecos de antes de que existiera
 * este sistema.
 */
export async function procesarLiquidacion(
  input: ProcesarLiquidacionInput
): Promise<ProcesarLiquidacionResult> {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  const parsed = procesarLiquidacionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const data = parsed.data

  const supabase = await createClient()

  const { data: historial, error: errHistorial } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_id, lab_fecha_inicio, lab_fecha_fin, lab_salario_real')
    .eq('lab_id', data.historialLaboralId)
    .maybeSingle<HistorialRow>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudo cargar el historial laboral del empleado.' }
  }
  if (!historial) {
    return { ok: false, error: 'El empleado no existe o no es visible.' }
  }
  if (historial.lab_fecha_fin) {
    return { ok: false, error: 'Este empleado ya tiene una salida registrada.' }
  }

  const { data: motivo, error: errMotivo } = await supabase
    .from('sgrh_cat_motivos_salida')
    .select('mot_id, mot_genera_cesantia, mot_genera_preaviso')
    .eq('mot_id', data.motivoSalidaId)
    .maybeSingle<MotivoRow>()

  if (errMotivo) {
    return { ok: false, error: 'No se pudo cargar el motivo de salida.' }
  }
  if (!motivo) {
    return { ok: false, error: 'El motivo de salida no existe.' }
  }

  const { data: historico, error: errHistorico } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      'ndt_salario_bruto, ndt_pagado, sgrh_nomina_periodo ( npe_periodo_mes, npe_periodo_anio, npe_quincena )'
    )
    .eq('ndt_historial_laboral_id', data.historialLaboralId)
    .returns<DetalleHistoricoRow[]>()

  if (errHistorico) {
    return { ok: false, error: 'No se pudo cargar el historial de pagos del empleado.' }
  }

  const fechaSalida = parseFechaLocal(data.fechaSalida)
  const fechaIngreso = parseFechaLocal(historial.lab_fecha_inicio)
  const anioSalida = fechaSalida.getFullYear()
  const mesSalida = fechaSalida.getMonth() + 1
  // Las quincenas del sistema se parten por día 15 del mes.
  const quincenaSalida = fechaSalida.getDate() <= 15 ? 1 : 2
  const claveSalida = claveQuincenal(anioSalida, mesSalida, quincenaSalida)

  const cicloAnio = anioCicloAguinaldo(mesSalida, anioSalida)
  // Diciembre del año anterior al cierre del ciclo, desde la 1ra quincena.
  const claveInicioCiclo = claveQuincenal(cicloAnio - 1, 12, 1)

  // Solo cuentan las planillas ya pagadas: una en borrador o aprobada pero
  // no pagada todavía no es un monto real devengado.
  const pagosVisibles = (historico ?? []).filter(
    (p) => p.sgrh_nomina_periodo !== null && p.ndt_pagado
  )

  const sumaSalariosBrutosCicloAguinaldo = pagosVisibles
    .filter((p) => {
      const periodo = p.sgrh_nomina_periodo!
      const clave = claveQuincenal(
        periodo.npe_periodo_anio,
        periodo.npe_periodo_mes,
        periodo.npe_quincena
      )
      return clave >= claveInicioCiclo && clave <= claveSalida
    })
    .reduce((acc, p) => acc + p.ndt_salario_bruto, 0)

  const ultimosSeis = pagosVisibles
    .filter((p) => {
      const periodo = p.sgrh_nomina_periodo!
      const clave = claveQuincenal(
        periodo.npe_periodo_anio,
        periodo.npe_periodo_mes,
        periodo.npe_quincena
      )
      return clave <= claveSalida
    })
    .sort((a, b) => {
      const periodoA = a.sgrh_nomina_periodo!
      const periodoB = b.sgrh_nomina_periodo!
      const claveA = claveQuincenal(
        periodoA.npe_periodo_anio,
        periodoA.npe_periodo_mes,
        periodoA.npe_quincena
      )
      const claveB = claveQuincenal(
        periodoB.npe_periodo_anio,
        periodoB.npe_periodo_mes,
        periodoB.npe_quincena
      )
      return claveB - claveA
    })
    .slice(0, 6)

  const salarioDiario =
    ultimosSeis.length > 0
      ? ultimosSeis.reduce((acc, p) => acc + p.ndt_salario_bruto, 0) / ultimosSeis.length / 30
      : historial.lab_salario_real / 30

  const mesesAntiguedad = calcularMesesAntiguedad(fechaIngreso, fechaSalida)
  const diasTrabajadosMesActual = Math.min(fechaSalida.getDate(), 30)

  const resultado = calcularLiquidacion({
    salarioDiario,
    diasTrabajadosMesActual,
    sumaSalariosBrutosCicloAguinaldo,
    diasVacacionesPendientes: data.diasVacacionesPendientes,
    mesesAntiguedad,
    generaCesantia: motivo.mot_genera_cesantia,
    generaPreaviso: motivo.mot_genera_preaviso,
  })

  const { data: inserted, error: errInsert } = await supabase
    .from('sgrh_liquidaciones')
    .insert({
      liq_historial_laboral_id: data.historialLaboralId,
      liq_motivo_salida_id: data.motivoSalidaId,
      liq_fecha_salida: data.fechaSalida,
      liq_salario_diario: salarioDiario,
      liq_dias_trabajados_mes: diasTrabajadosMesActual,
      liq_salario_proporcional: resultado.salarioProporcional,
      liq_aguinaldo_proporcional: resultado.aguinaldoProporcional,
      liq_dias_vacaciones_pendientes: data.diasVacacionesPendientes,
      liq_vacaciones_pagadas: resultado.vacacionesPagadas,
      liq_dias_preaviso: resultado.diasPreaviso,
      liq_preaviso: resultado.preaviso,
      liq_dias_cesantia: resultado.diasCesantia,
      liq_cesantia: resultado.cesantia,
      liq_total: resultado.total,
    })
    .select('liq_id')
    .single<{ liq_id: number }>()

  if (errInsert) {
    return {
      ok: false,
      error:
        'No se pudo guardar la liquidación (¿ya se procesó una liquidación para este empleado?).',
    }
  }

  const { error: errCierre } = await supabase
    .from('sgrh_historial_laboral')
    .update({
      lab_fecha_fin: data.fechaSalida,
      lab_motivo_salida_id: data.motivoSalidaId,
    })
    .eq('lab_id', data.historialLaboralId)

  if (errCierre) {
    return {
      ok: false,
      error:
        'La liquidación se calculó y se guardó, pero no se pudo cerrar el expediente del empleado. Revisalo manualmente en Historial Laboral.',
    }
  }

  revalidatePath('/payroll/aguinaldo-liquidacion')

  return {
    ok: true,
    data: {
      liqId: inserted.liq_id,
      salarioProporcional: resultado.salarioProporcional,
      aguinaldoProporcional: resultado.aguinaldoProporcional,
      vacacionesPagadas: resultado.vacacionesPagadas,
      diasPreaviso: resultado.diasPreaviso,
      preaviso: resultado.preaviso,
      diasCesantia: resultado.diasCesantia,
      cesantia: resultado.cesantia,
      total: resultado.total,
    },
  }
}
