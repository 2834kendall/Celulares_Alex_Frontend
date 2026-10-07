'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { anioCicloAguinaldo } from '@/modules/payroll/lib/liquidacion'
import { liquidacionesQueCubren } from '@/modules/payroll/lib/liquidacionData'
import { sincronizarEstadoPeriodo } from '@/modules/payroll/lib/estadoPeriodoData'
import { hoyLocal, rangoQuincena } from '@/modules/payroll/lib/fechas'
import { montoIncapacidadEnVivo } from '@/modules/payroll/lib/incapacidad'
import { generarCodigoVerificacion } from '@/modules/payroll/lib/comprobante'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'
import {
  MENSAJE_PROBLEMA,
  lecturaUtilizable,
  type TotalesPeriodo,
} from '@/modules/payroll/lib/horasPeriodo'
import {
  cumplimientoQuincena,
  evaluarBaseGuardado,
  type QuincenaRef,
} from '@/modules/payroll/lib/prellenadoAsistencia'
import { CODIGO_AJUSTE, CODIGO_SALARIO_BASE } from '@/modules/payroll/lib/planilla'
import { formatCRC, formatDate, formatHoras } from '@/modules/payroll/lib/format'
import { marcasCambiaron, origenHoras } from '@/modules/payroll/lib/horasOrigen'

interface DetalleActualRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  ndt_pagado: boolean
  ndt_historial_laboral_id: number
  ndt_salario_bruto: number
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_horas_asistencia: number | null
  ndt_horas_extra_asistencia: number | null
  ndt_dias_incapacidad_empleador?: number | null
  sgrh_nomina_periodo: {
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_quincena: number
    npe_fecha_inicio_periodo: string | null
    npe_fecha_fin_periodo: string | null
  } | null
}

export type MarcarDetallePagadoResult = { ok: true } | { ok: false; error: string }

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Suma (o resta, si se desmarca un pago) la parte proporcional del aguinaldo
 * de este período — salario bruto ÷ 12 — a la provisión anual del empleado
 * (sgrh_provisiones_anuales.pra_monto_acumulado_aguinaldo). El ciclo de
 * aguinaldo va de diciembre a noviembre; diciembre abre el ciclo del año
 * siguiente (ver anioCicloAguinaldo).
 *
 * Es "mejor esfuerzo": si falla, no bloquea el marcado de pago (que ya se
 * guardó en sgrh_nomina_detalle), pero el acumulado de aguinaldo puede
 * quedar desactualizado para ese empleado y habría que revisarlo a mano.
 */
async function acumularProvisionAguinaldo(
  supabase: SupabaseServerClient,
  historialLaboralId: number,
  mesPeriodo: number,
  anioPeriodo: number,
  salarioBruto: number,
  signo: 1 | -1
): Promise<void> {
  const anio = anioCicloAguinaldo(mesPeriodo, anioPeriodo)
  const delta = (salarioBruto / 12) * signo

  const { data: existente } = await supabase
    .from('sgrh_provisiones_anuales')
    .select('pra_id, pra_monto_acumulado_aguinaldo')
    .eq('pra_historial_laboral_id', historialLaboralId)
    .eq('pra_anio', anio)
    .maybeSingle<{ pra_id: number; pra_monto_acumulado_aguinaldo: number }>()

  if (existente) {
    await supabase
      .from('sgrh_provisiones_anuales')
      .update({
        pra_monto_acumulado_aguinaldo: Math.max(0, existente.pra_monto_acumulado_aguinaldo + delta),
      })
      .eq('pra_id', existente.pra_id)
    return
  }

  // No crear una fila nueva solo para restar (desmarcar un pago que nunca
  // llegó a acumular nada, por ejemplo si la fila se creó después).
  if (delta > 0) {
    await supabase.from('sgrh_provisiones_anuales').insert({
      pra_historial_laboral_id: historialLaboralId,
      pra_anio: anio,
      pra_monto_acumulado_aguinaldo: delta,
    })
  }
}

const INTENTOS_CODIGO_COMPROBANTE = 3

/**
 * Crea (o retira) el comprobante de pago del empleado en
 * sgrh_comprobantes_pago.
 *
 * La tabla existía desde el baseline —con índice único, RLS y una columna
 * para que el empleado confirme el recibo— pero nadie la escribía: el
 * comprobante se armaba al vuelo desde el detalle y no quedaba ninguna
 * evidencia de que el pago se hizo. Ahora marcar el pago deja esa fila, con
 * un código de verificación que va impreso en el comprobante.
 *
 * Al DESMARCAR se borra la fila: el pago no ocurrió, y dejar vivo un código
 * de verificación de un pago inexistente es peor que no tenerlo. El periodo
 * sigue en borrador en ese momento, así que todavía no es historia.
 *
 * Es "mejor esfuerzo", igual que la provisión de aguinaldo: si falla, no
 * bloquea el marcado que ya se guardó.
 */
async function sincronizarComprobante(
  supabase: SupabaseServerClient,
  ndtId: number,
  pagado: boolean
): Promise<void> {
  if (!pagado) {
    await supabase.from('sgrh_comprobantes_pago').delete().eq('com_nomina_detalle_id', ndtId)
    return
  }

  const { data: existente } = await supabase
    .from('sgrh_comprobantes_pago')
    .select('com_id')
    .eq('com_nomina_detalle_id', ndtId)
    .maybeSingle<{ com_id: number }>()

  // Ya tiene comprobante (se desmarcó y se volvió a marcar sin que la
  // eliminación llegara a correr): no se emite otro código para el mismo pago.
  if (existente) return

  for (let intento = 0; intento < INTENTOS_CODIGO_COMPROBANTE; intento += 1) {
    const { error } = await supabase.from('sgrh_comprobantes_pago').insert({
      com_nomina_detalle_id: ndtId,
      com_codigo_verificacion: generarCodigoVerificacion(),
    })

    if (!error) return
    // 23505 = choque con el índice único del código. Cualquier otro error no
    // se arregla reintentando.
    if (error.code !== '23505') return
  }
}

/**
 * Marca (o desmarca) el pago de un empleado dentro de un periodo
 * (ndt_pagado). Después de guardarlo, recalcula el estado del periodo
 * completo (npe_estado): pasa solo a 'pagado' cuando TODOS sus empleados
 * quedan pagados (o su salario va en una liquidación, ver
 * lib/estadoPeriodoData.ts), y vuelve a 'borrador' si se desmarca alguno — así el
 * estado del periodo siempre refleja lo que realmente se pagó, sin
 * necesidad de un botón aparte. Al marcarlo, también acumula la parte
 * proporcional de aguinaldo de este período en la provisión anual del
 * empleado.
 */
interface LineaIngresoBaseRow {
  ing_monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string } | null
}

interface ContratoBaseRow {
  lab_salario_base: number | null
  lab_salario_real: number | null
  sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: number | null } | null
}

/**
 * Lee el BASE guardado y el contrato, y dice si ese BASE quedó viejo (ver
 * evaluarBaseGuardado). Si no se puede leer, NO se da por bueno: se devuelve
 * el error y el pago espera. Pagar sin poder verificar es justamente lo que
 * esto evita.
 */
async function verificarBaseGuardado(
  supabase: SupabaseServerClient,
  params: {
    ndtId: number
    historialLaboralId: number
    guardadas: { horas: number; horasExtra: number }
    lectura: TotalesPeriodo
    quincena: QuincenaRef
  }
): Promise<
  | {
      ok: true
      desactualizado: boolean
      guardado: number
      esperado: number | null
      ajusteGuardado: number
      ajusteEsperado: number | null
    }
  | { ok: false; error: string }
> {
  const [{ data: lineas, error: errLineas }, { data: contrato, error: errContrato }] =
    await Promise.all([
      supabase
        .from('sgrh_nomina_linea_ingreso')
        .select('ing_monto, sgrh_cat_conceptos_nomina ( con_codigo )')
        .eq('ing_nomina_detalle_id', params.ndtId)
        .returns<LineaIngresoBaseRow[]>(),
      supabase
        .from('sgrh_historial_laboral')
        .select(
          'lab_salario_base, lab_salario_real, sgrh_cat_tipos_jornada ( tjo_horas_max_semanales )'
        )
        .eq('lab_id', params.historialLaboralId)
        .maybeSingle<ContratoBaseRow>(),
    ])

  if (errLineas || errContrato || !contrato) {
    return {
      ok: false,
      error:
        'No se pudo verificar el salario base de esta fila contra la asistencia, así que no marqué el pago. Intentá de nuevo.',
    }
  }

  const sumar = (codigo: string) =>
    (lineas ?? [])
      .filter((l) => l.sgrh_cat_conceptos_nomina?.con_codigo === codigo)
      .reduce((acc, l) => acc + l.ing_monto, 0)
  const guardado = sumar(CODIGO_SALARIO_BASE)
  const ajusteGuardado = sumar(CODIGO_AJUSTE)

  const { desactualizado, esperado, ajusteEsperado } = evaluarBaseGuardado({
    baseGuardado: guardado,
    ajusteGuardado,
    contrato: {
      salarioBaseMensual: contrato.lab_salario_base ?? 0,
      salarioRealMensual: contrato.lab_salario_real ?? null,
      horasSemanales: contrato.sgrh_cat_tipos_jornada?.tjo_horas_max_semanales ?? null,
    },
    guardadas: params.guardadas,
    lectura: params.lectura,
    quincena: params.quincena,
  })
  return { ok: true, desactualizado, guardado, esperado, ajusteGuardado, ajusteEsperado }
}

/**
 * ¿Esta quincena ya se usó para pagar algo fuera de la planilla? Si es así,
 * no se puede desmarcar: devuelve el motivo para mostrarlo.
 *
 *  - El aguinaldo de su ciclo ya se pagó (comprobante, o el botón viejo de
 *    la provisión): se calculó con el bruto de esta quincena.
 *  - El empleado ya se liquidó y salió después de que empezara esta
 *    quincena: la liquidación promedió salarios, sumó el aguinaldo
 *    proporcional y descontó lo pagado por planilla con estas quincenas.
 *
 * Se mira a todos los contratos del empleado. Uno de una relación anterior
 * (antes de un reingreso) no estorba: su aguinaldo y su liquidación son de
 * fechas anteriores a esta quincena.
 */
async function motivoParaNoDesmarcar(
  supabase: SupabaseServerClient,
  labId: number,
  periodo: NonNullable<DetalleActualRow['sgrh_nomina_periodo']>
): Promise<{ ok: true; motivo: string | null } | { ok: false }> {
  const { data: contrato, error: errContrato } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_empleado_id')
    .eq('lab_id', labId)
    .maybeSingle<{ lab_empleado_id: number }>()
  if (errContrato || !contrato) return { ok: false }

  const { data: contratos, error: errContratos } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_id')
    .eq('lab_empleado_id', contrato.lab_empleado_id)
    .returns<{ lab_id: number }[]>()
  if (errContratos) return { ok: false }
  const labIds = [
    ...new Set([labId, ...(Array.isArray(contratos) ? contratos : []).map((c) => c.lab_id)]),
  ]

  const ciclo = anioCicloAguinaldo(periodo.npe_periodo_mes, periodo.npe_periodo_anio)
  const inicio =
    periodo.npe_fecha_inicio_periodo ??
    rangoQuincena(periodo.npe_periodo_mes, periodo.npe_periodo_anio, periodo.npe_quincena)
      ?.inicio ??
    `${periodo.npe_periodo_anio}-01-01`

  const [pagos, provisiones, liquidaciones] = await Promise.all([
    supabase
      .from('sgrh_pagos_extraordinarios')
      .select('pex_id')
      .eq('pex_tipo', 'aguinaldo')
      .eq('pex_anio_aguinaldo', ciclo)
      .in('pex_historial_laboral_id', labIds)
      .returns<{ pex_id: number }[]>(),
    supabase
      .from('sgrh_provisiones_anuales')
      .select('pra_id')
      .eq('pra_anio', ciclo)
      .eq('pra_aguinaldo_pagado', true)
      .in('pra_historial_laboral_id', labIds)
      .returns<{ pra_id: number }[]>(),
    supabase
      .from('sgrh_liquidaciones')
      .select('liq_id')
      .in('liq_historial_laboral_id', labIds)
      .gte('liq_fecha_salida', inicio)
      .returns<{ liq_id: number }[]>(),
  ])
  if (pagos.error || provisiones.error || liquidaciones.error) return { ok: false }

  const hay = (r: { data: unknown[] | null }) => Array.isArray(r.data) && r.data.length > 0
  if (hay(liquidaciones)) {
    return {
      ok: true,
      motivo: `No se puede desmarcar: esta quincena ya se usó en la liquidación n.° ${liquidaciones.data![0].liq_id} del empleado (promedio de salarios y aguinaldo proporcional). Desmarcarla dejaría esa liquidación con montos que ya no coinciden con la planilla.`,
    }
  }
  if (hay(pagos) || hay(provisiones)) {
    return {
      ok: true,
      motivo: `No se puede desmarcar: el aguinaldo ${ciclo} de este empleado ya se pagó, y se calculó con esta quincena. Desmarcarla dejaría ese aguinaldo con un monto que ya no coincide con la planilla.`,
    }
  }
  return { ok: true, motivo: null }
}

/**
 * Monto y porcentaje de la incapacidad para congelarlos al marcar el pago,
 * con la misma cuenta que muestra la planilla (montoIncapacidadEnVivo). null
 * si no se pudo leer el contrato o el catálogo.
 */
async function incapacidadAlPagar(
  supabase: SupabaseServerClient,
  labId: number,
  diasEmpleador: number
): Promise<{ ndt_monto_incapacidad: number; ndt_porcentaje_incapacidad: number } | null> {
  const [contrato, tipo] = await Promise.all([
    supabase
      .from('sgrh_historial_laboral')
      .select('lab_salario_base')
      .eq('lab_id', labId)
      .maybeSingle<{ lab_salario_base: number | null }>(),
    supabase
      .from('sgrh_cat_tipos_ausencia')
      .select('tau_porcentaje_pago_empleador')
      .eq('tau_codigo', 'INC_ENF')
      .maybeSingle<{ tau_porcentaje_pago_empleador: number }>(),
  ])
  if (contrato.error || tipo.error || !contrato.data || !tipo.data) return null
  const porcentaje = Number(tipo.data.tau_porcentaje_pago_empleador)
  return {
    ndt_monto_incapacidad: montoIncapacidadEnVivo(
      diasEmpleador,
      Number(contrato.data.lab_salario_base ?? 0),
      porcentaje
    ),
    ndt_porcentaje_incapacidad: porcentaje,
  }
}

export async function marcarDetallePagado(
  ndtId: number,
  pagado: boolean
): Promise<MarcarDetallePagadoResult> {
  if (!Number.isInteger(ndtId) || ndtId <= 0) {
    return { ok: false, error: 'Detalle inválido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: detalle, error: errDetalle } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `
      ndt_id,
      ndt_nomina_periodo_id,
      ndt_pagado,
      ndt_historial_laboral_id,
      ndt_salario_bruto,
      ndt_horas_ordinarias_diurnas,
      ndt_horas_extra_al_50,
      ndt_horas_asistencia,
      ndt_horas_extra_asistencia,
      ndt_dias_incapacidad_empleador,
      sgrh_nomina_periodo (
        npe_periodo_mes, npe_periodo_anio, npe_quincena,
        npe_fecha_inicio_periodo, npe_fecha_fin_periodo
      )
    `
    )
    .eq('ndt_id', ndtId)
    .maybeSingle<DetalleActualRow>()

  if (errDetalle) {
    return { ok: false, error: 'No se pudo cargar el detalle de la planilla.' }
  }
  if (!detalle) {
    return { ok: false, error: 'El detalle no existe o no es visible.' }
  }

  // Ya está como se pide: no hay nada que hacer. Antes se volvía a escribir
  // la fila, y "marcar pagado" sobre una ya pagada le cambiaba la fecha de
  // pago a la de hoy.
  if (detalle.ndt_pagado === pagado) {
    return { ok: true }
  }

  const periodo = detalle.sgrh_nomina_periodo

  // Desmarcar una quincena que ya se usó para pagar algo fuera de la planilla
  // dejaba ese pago con un monto que ya no corresponde: el aguinaldo pagado
  // (o la liquidación) seguía con el bruto viejo y como "pagado".
  if (!pagado && periodo) {
    const bloqueo = await motivoParaNoDesmarcar(supabase, detalle.ndt_historial_laboral_id, periodo)
    if (!bloqueo.ok) {
      return { ok: false, error: 'No se pudo verificar si esta quincena ya se usó en otro pago.' }
    }
    if (bloqueo.motivo) {
      return { ok: false, error: bloqueo.motivo }
    }
  }

  // Un empleado liquidado ya cobró en el finiquito los días del mes de salida
  // que no estaban pagados por planilla (salario pendiente). Marcar pagada
  // una de esas quincenas los pagaba dos veces.
  if (pagado && periodo) {
    const cubiertas = await liquidacionesQueCubren(supabase, [detalle.ndt_historial_laboral_id], {
      anio: periodo.npe_periodo_anio,
      mes: periodo.npe_periodo_mes,
      quincena: periodo.npe_quincena,
    })
    if (!cubiertas.ok) {
      return { ok: false, error: 'No se pudo verificar si el empleado ya fue liquidado.' }
    }
    const liq = cubiertas.data.get(detalle.ndt_historial_laboral_id)
    if (liq) {
      return {
        ok: false,
        error: `Este salario ya va en la liquidación n.° ${liq.liqId} (${liq.diasSalarioPendiente} día(s) de salario pendiente hasta la salida del ${formatDate(liq.fechaSalida)}). Pagarlo también por planilla sería pagarlo dos veces: esta fila se deja sin pagar.`,
      }
    }
  }

  // Antes de dar por pagado a alguien, sus marcas del periodo tienen que
  // estar completas. Un dia con entrada y sin salida no suma horas, asi que
  // el monto calculado esta corto: pagarlo es pagarle de menos a la persona
  // por un fallo del kiosco o un olvido, y una vez marcado el periodo se cierra
  // y el error queda enterrado.
  //
  // Solo se revisa al MARCAR. Desmarcar siempre se puede: es la salida cuando
  // algo quedo mal.
  let totales: TotalesPeriodo | undefined
  if (pagado && periodo?.npe_fecha_inicio_periodo && periodo.npe_fecha_fin_periodo) {
    const horas = await getHorasDelPeriodo(supabase, {
      historialLaboralIds: [detalle.ndt_historial_laboral_id],
      fechaInicio: periodo.npe_fecha_inicio_periodo,
      fechaFin: periodo.npe_fecha_fin_periodo,
    })

    totales = horas.ok ? horas.data.get(detalle.ndt_historial_laboral_id) : undefined
    // Solo los que de verdad dejan las horas cortas. Un día con marcas pero
    // sin horario programado se avisa en la pantalla del periodo, pero no
    // traba el pago (ver PROBLEMAS_QUE_BLOQUEAN en lib/horasPeriodo.ts).
    const problemas = totales?.diasQueBloquean ?? []

    if (problemas.length > 0) {
      const detalleDias = problemas
        .slice(0, 3)
        .map((d) => `${formatDate(d.fecha)} (${MENSAJE_PROBLEMA[d.problema]})`)
        .join(' · ')
      const resto = problemas.length > 3 ? ` y ${problemas.length - 3} día(s) más` : ''

      return {
        ok: false,
        error: `Este empleado tiene marcas de asistencia incompletas en el periodo, así que las horas calculadas están cortas: ${detalleDias}${resto}. Corregí las marcas en Asistencia antes de marcar el pago.`,
      }
    }

    // Segundo bloqueo: alguien corrigió una marca DESPUÉS de armada la
    // planilla. La fila guarda una foto de lo que decía la asistencia en ese
    // momento (ver lib/horasOrigen.ts); si hoy dice otra cosa, el monto
    // calculado ya no corresponde.
    //
    // Solo se bloquea cuando las horas venían de la asistencia. Si alguien las
    // había corregido a mano a propósito, la diferencia es deliberada y no hay
    // nada que avisar: esa decisión ya se tomó.
    const foto = {
      horas: detalle.ndt_horas_asistencia,
      horasExtra: detalle.ndt_horas_extra_asistencia,
    }
    const guardadas = {
      horas: detalle.ndt_horas_ordinarias_diurnas,
      horasExtra: detalle.ndt_horas_extra_al_50 ?? 0,
    }

    // lecturaUtilizable: sin horas programadas la lectura son ceros que no
    // dicen nada, y compararse contra ellos bloqueaba TODOS los pagos con un
    // "hoy las marcas dicen 0 h" que era falso.
    if (lecturaUtilizable(totales) && origenHoras(guardadas, foto) === 'asistencia') {
      const ahora = { horas: totales!.horasOrdinarias, horasExtra: totales!.horasExtra }

      if (marcasCambiaron(foto, ahora)) {
        return {
          ok: false,
          // El "cómo destrabarlo" tiene que nombrar lo que de verdad
          // funciona. Volver a subir el MISMO archivo no sirve: trae las horas
          // viejas, y el sistema lo detecta y no lo toma como corrección. Lo
          // que recalcula todo es descargar la plantilla otra vez, porque se
          // genera prorrateando el salario sobre las horas que dicen las
          // marcas hoy.
          error: `Las marcas de este empleado cambiaron después de armar la planilla: se calculó con ${formatHoras(foto.horas ?? 0)} h (${formatHoras(foto.horasExtra ?? 0)} h extra) y hoy las marcas dicen ${formatHoras(ahora.horas)} h (${formatHoras(ahora.horasExtra)} h extra). Descargá de nuevo la plantilla del periodo y subila —viene con las horas y los montos ya recalculados— o corregí sus horas a mano en el detalle. Después marcá el pago.`,
        }
      }
    }

    // Tercer bloqueo: el BASE quedó viejo sin que cambien las horas. Pasa
    // cuando unas vacaciones, un feriado o una incapacidad se aprueban DESPUÉS
    // de armar la fila: las horas trabajadas son las mismas, así que el
    // bloqueo anterior no salta, pero el salario que corresponde es otro. Solo
    // se mira un BASE que puso el sistema; uno corregido a mano se respeta.
    if (lecturaUtilizable(totales)) {
      const verificacion = await verificarBaseGuardado(supabase, {
        ndtId,
        historialLaboralId: detalle.ndt_historial_laboral_id,
        guardadas,
        lectura: totales!,
        quincena: {
          anio: periodo!.npe_periodo_anio,
          mes: periodo!.npe_periodo_mes,
          quincena: periodo!.npe_quincena,
        },
      })
      if (!verificacion.ok) return { ok: false, error: verificacion.error }
      if (verificacion.desactualizado) {
        return {
          ok: false,
          error: `El salario de esta fila ya no corresponde: se guardó ${formatCRC(verificacion.guardado)} de base y ${formatCRC(verificacion.ajusteGuardado)} de ajuste, y con la regla de hoy le toca ${formatCRC(verificacion.esperado!)} de base y ${formatCRC(verificacion.ajusteEsperado!)} de ajuste. Usá "Recalcular desde asistencia" en el periodo y después marcá el pago.`,
        }
      }
    }
  }

  // Una fila en ₡0 no es un pago: es una fila que quedó a medias. Dejarla
  // marcar emitía un comprobante con monto cero, acumulaba ₡0 de aguinaldo y
  // podía cerrar el periodo entero — y nadie se entera hasta que el empleado
  // reclama. Solo se bloquea al MARCAR; desmarcar siempre se puede.
  // La excepción: una quincena entera de incapacidad o de permiso sin goce
  // SÍ va en ₡0 de salario (la incapacidad se paga como subsidio aparte). Sin
  // poder marcarla, el periodo no se podía cerrar nunca.
  //
  // Y otra: tenía horario y no vino ningún día (sin marcas, cuenta 0 h). El
  // cumplimiento es 0 y el ₡0 es el monto correcto, no una fila a medias.
  const ceroJustificado =
    totales?.periodoCubiertoPorAusencias === true ||
    (lecturaUtilizable(totales) && cumplimientoQuincena(totales!, null).ratio === 0)
  if (pagado && !(detalle.ndt_salario_bruto > 0) && !ceroJustificado) {
    return {
      ok: false,
      error:
        'Esta fila está en ₡0, así que no hay nada que pagar. Suele ser que al empleado le falta el salario en su contrato, o que la fila se armó antes de tener las horas: revisá el detalle y volvé a calcularlo antes de marcar el pago.',
    }
  }

  // La incapacidad que paga el patrono se congela con el pago: el comprobante
  // ya emitido no puede cambiar si después cambia el salario o el porcentaje
  // del catálogo. Al desmarcar vuelve a calcularse en vivo.
  let incapacidad: {
    ndt_monto_incapacidad: number | null
    ndt_porcentaje_incapacidad: number | null
  } = {
    ndt_monto_incapacidad: null,
    ndt_porcentaje_incapacidad: null,
  }
  if (pagado && Number(detalle.ndt_dias_incapacidad_empleador ?? 0) > 0) {
    const congelada = await incapacidadAlPagar(
      supabase,
      detalle.ndt_historial_laboral_id,
      Number(detalle.ndt_dias_incapacidad_empleador)
    )
    if (!congelada) {
      return {
        ok: false,
        error:
          'No se pudo calcular el monto de la incapacidad para guardarlo con el pago. Volvé a intentarlo.',
      }
    }
    incapacidad = congelada
  }

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_pagado: pagado,
      ndt_fecha_pago: pagado ? hoyLocal() : null,
      ...incapacidad,
    })
    .eq('ndt_id', ndtId)

  if (errUpdate) {
    return { ok: false, error: 'No se pudo actualizar el estado de pago.' }
  }

  // Solo mover la provisión si el estado realmente cambió, para no duplicar
  // el acumulado si esto se llama dos veces con el mismo valor.
  if (detalle.ndt_pagado !== pagado) {
    await sincronizarComprobante(supabase, ndtId, pagado)
  }

  if (detalle.ndt_pagado !== pagado && detalle.sgrh_nomina_periodo) {
    await acumularProvisionAguinaldo(
      supabase,
      detalle.ndt_historial_laboral_id,
      detalle.sgrh_nomina_periodo.npe_periodo_mes,
      detalle.sgrh_nomina_periodo.npe_periodo_anio,
      detalle.ndt_salario_bruto,
      pagado ? 1 : -1
    )
  }

  await sincronizarEstadoPeriodo(supabase, detalle.ndt_nomina_periodo_id)

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${detalle.ndt_nomina_periodo_id}`)
  revalidatePath('/payroll/aguinaldo-liquidacion')
  return { ok: true }
}
