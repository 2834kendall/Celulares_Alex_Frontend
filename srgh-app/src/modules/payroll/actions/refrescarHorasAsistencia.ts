'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { calcularPlanillaPorConceptos, type ConceptoCalculo } from '@/modules/payroll/lib/planilla'
import { reemplazarLineasDetalle } from '@/modules/payroll/lib/lineasNomina'
import {
  CAMPOS_CONCEPTO_DE_LINEA,
  fusionarAjenas,
  leerMontosGuardados,
} from '@/modules/payroll/lib/lineasAjenas'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'
import { salarioPorHoraPeriodo } from '@/modules/payroll/lib/horasPeriodo'
import { camposFotoAsistencia, origenHoras } from '@/modules/payroll/lib/horasOrigen'
import { ahoraLocal } from '@/modules/payroll/lib/fechas'
import { sincronizarMovimientoBancoHoras } from '@/modules/payroll/lib/bancoHorasAccrual'

export type RefrescarHorasResult =
  | { ok: true; horas: number; horasExtra: number; sinCambios: boolean }
  /** Las horas estaban corregidas a mano: hay que confirmar antes de pisarlas. */
  | { ok: false; necesitaConfirmacion: true; error: string }
  | { ok: false; necesitaConfirmacion?: false; error: string }

interface DetalleRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  ndt_historial_laboral_id: number
  ndt_pagado: boolean
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_salario_por_hora: number
  ndt_horas_asistencia: number | null
  ndt_horas_extra_asistencia: number | null
  sgrh_nomina_periodo: {
    npe_estado: string
    npe_fecha_inicio_periodo: string | null
    npe_fecha_fin_periodo: string | null
  } | null
}

/**
 * Trae a la planilla las horas que dice la asistencia AHORA, para un empleado.
 *
 * La planilla es una foto, no un espejo: las horas se congelan cuando se sube
 * el Excel o se edita el detalle, y no se mueven solas. Eso es a propósito —si
 * se actualizaran en cada visita, una quincena ya pagada cambiaría de monto
 * sola y dejaría de corresponder con su comprobante y con el aguinaldo que ya
 * acumuló.
 *
 * Pero hasta ahora la única forma de traer las horas nuevas era volver a bajar
 * y subir el Excel entero, o ir a consultar la asistencia en otra pantalla y
 * transcribirla a mano. Por un empleado al que se le asignó un horario después
 * de armada la planilla, las dos son desproporcionadas. Esto es ese mismo
 * recálculo, para una sola fila y sin archivos de por medio.
 *
 * Lo que NO hace: tocar filas ya pagadas, ni periodos fuera de borrador, ni
 * pisar en silencio unas horas que alguien corrigió a mano (eso pide
 * confirmación explícita).
 */
export async function refrescarHorasAsistencia(
  ndtId: number,
  confirmarSobrescribirAjuste = false
): Promise<RefrescarHorasResult> {
  if (!Number.isInteger(ndtId) || ndtId <= 0) {
    return { ok: false, error: 'Detalle inválido.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const usuarioId = (claims.app_metadata as { usr_id?: number })?.usr_id ?? null
  const supabase = await createClient()

  const { data: detalle, error: errDetalle } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `ndt_id, ndt_nomina_periodo_id, ndt_historial_laboral_id, ndt_pagado,
       ndt_horas_ordinarias_diurnas, ndt_horas_extra_al_50, ndt_salario_por_hora,
       ndt_horas_asistencia, ndt_horas_extra_asistencia,
       sgrh_nomina_periodo ( npe_estado, npe_fecha_inicio_periodo, npe_fecha_fin_periodo )`
    )
    .eq('ndt_id', ndtId)
    .maybeSingle<DetalleRow>()

  if (errDetalle) {
    return { ok: false, error: 'No se pudo cargar el detalle de la planilla.' }
  }
  if (!detalle) {
    return { ok: false, error: 'El detalle no existe o no es visible.' }
  }

  const periodo = detalle.sgrh_nomina_periodo
  if (periodo?.npe_estado !== 'borrador') {
    return {
      ok: false,
      error: 'Solo se pueden actualizar las horas mientras el periodo está en borrador.',
    }
  }
  // Cambiarle las horas a alguien que ya cobró movería un pago hecho, con su
  // comprobante emitido y su aguinaldo acumulado.
  if (detalle.ndt_pagado) {
    return {
      ok: false,
      error:
        'A este empleado ya se le marcó el pago de la quincena. Desmarcá ese pago primero si hay que corregirle las horas.',
    }
  }
  if (!periodo.npe_fecha_inicio_periodo || !periodo.npe_fecha_fin_periodo) {
    return {
      ok: false,
      error: 'El periodo no tiene fechas, así que no hay marcas de asistencia que leer.',
    }
  }

  const lectura = await getHorasDelPeriodo(supabase, {
    historialLaboralIds: [detalle.ndt_historial_laboral_id],
    fechaInicio: periodo.npe_fecha_inicio_periodo,
    fechaFin: periodo.npe_fecha_fin_periodo,
  })

  if (!lectura.ok) {
    return { ok: false, error: lectura.error }
  }

  const totales = lectura.data.get(detalle.ndt_historial_laboral_id)
  if (!totales) {
    return { ok: false, error: 'No se encontraron marcas de asistencia de este empleado.' }
  }

  const guardadas = {
    horas: detalle.ndt_horas_ordinarias_diurnas,
    horasExtra: detalle.ndt_horas_extra_al_50 ?? 0,
  }
  const asistencia = { horas: totales.horasOrdinarias, horasExtra: totales.horasExtra }
  const fotoPrevia = {
    horas: detalle.ndt_horas_asistencia,
    horasExtra: detalle.ndt_horas_extra_asistencia,
  }

  const sinCambios =
    Math.abs(guardadas.horas - asistencia.horas) < 0.005 &&
    Math.abs(guardadas.horasExtra - asistencia.horasExtra) < 0.005

  if (sinCambios) {
    return {
      ok: true,
      horas: asistencia.horas,
      horasExtra: asistencia.horasExtra,
      sinCambios: true,
    }
  }

  // Las horas guardadas no coinciden con la foto: alguien las dejó distintas a
  // propósito (subió un Excel corregido, o editó el detalle). Pisarlas sin
  // preguntar borraría esa decisión sin dejar rastro, que es exactamente lo
  // que este botón NO debe hacer.
  if (origenHoras(guardadas, fotoPrevia) === 'ajustadas' && !confirmarSobrescribirAjuste) {
    return {
      ok: false,
      necesitaConfirmacion: true,
      error: `Estas horas están corregidas a mano (${guardadas.horas} h, ${guardadas.horasExtra} h extra) y la asistencia dice ${asistencia.horas} h, ${asistencia.horasExtra} h extra. ¿Reemplazo la corrección por lo que dicen las marcas?`,
    }
  }

  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select(CAMPOS_CONCEPTO_DE_LINEA)
    .eq('con_activo', true)
    .returns<ConceptoCalculo[]>()

  if (errConceptos || !conceptos || conceptos.length === 0) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }

  const { montos, ajenas, error: errMontos } = await leerMontosGuardados(supabase, ndtId, conceptos)
  if (errMontos) {
    return { ok: false, error: errMontos }
  }

  // El valor de la hora sale del base prorrateado sobre las horas PROGRAMADAS
  // del periodo, igual que en la plantilla de Excel. Asignarle un horario a un
  // día sube esas horas esperadas, así que el valor de la hora baja: si no se
  // recalculara acá, refrescar dejaría un número distinto al que produciría
  // volver a subir el archivo.
  const { data: contrato } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_salario_base')
    .eq('lab_id', detalle.ndt_historial_laboral_id)
    .maybeSingle<{ lab_salario_base: number | null }>()

  const salarioBase = contrato?.lab_salario_base ?? 0
  // Sin horas programadas el prorrateo daría 0 y le dejaría la hora en cero a
  // alguien que sí trabajó: en ese caso se conserva el valor que ya tenía.
  const salarioPorHora =
    totales.horasEsperadas > 0 && salarioBase > 0
      ? salarioPorHoraPeriodo(salarioBase, totales.horasEsperadas)
      : detalle.ndt_salario_por_hora

  const { conceptos: conceptosCalculo, montos: montosFinales } = fusionarAjenas(
    conceptos,
    montos,
    ajenas
  )

  const {
    salarioBruto,
    totalDeducciones,
    salarioNeto,
    totalCargasPatronales,
    lineas,
    lineasPatronales,
  } = calcularPlanillaPorConceptos(conceptosCalculo, {
    montos: montosFinales,
    horasTrabajadas: asistencia.horas,
    horasExtra: asistencia.horasExtra,
    salarioPorHora,
  })

  // Lo que se guarda ES lo que dicen las marcas, así que la foto queda igual a
  // las horas y la fila vuelve a contar como "origen: asistencia".
  const foto = camposFotoAsistencia({
    lectura: { estado: 'ok', datos: asistencia },
    guardadas: asistencia,
    guardadasPrevias: guardadas,
    fotoPrevia,
    usuarioId,
    ahora: ahoraLocal(),
  })

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_salario_bruto: salarioBruto,
      ndt_total_deducciones_obreras: totalDeducciones,
      ndt_salario_neto: salarioNeto,
      ndt_total_cargas_patronales: totalCargasPatronales,
      ndt_horas_ordinarias_diurnas: asistencia.horas,
      ndt_horas_extra_al_50: asistencia.horasExtra,
      ndt_salario_por_hora: salarioPorHora,
      ...(foto.escribir ? foto.campos : {}),
    })
    .eq('ndt_id', ndtId)

  if (errUpdate) {
    return { ok: false, error: 'No se pudieron guardar las horas actualizadas.' }
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

  // Las horas extra cambiaron, así que el movimiento del banco de horas de
  // este periodo tiene que seguirlas.
  const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
    ndtId,
    historialLaboralId: detalle.ndt_historial_laboral_id,
    horasExtra: asistencia.horasExtra,
    salarioPorHora,
  })
  if (errBanco) {
    return { ok: false, error: errBanco }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${detalle.ndt_nomina_periodo_id}`)
  revalidatePath('/payroll/banco-horas')
  return { ok: true, horas: asistencia.horas, horasExtra: asistencia.horasExtra, sinCambios: false }
}
