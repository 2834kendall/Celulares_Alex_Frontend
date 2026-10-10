import type { createClient } from '@/lib/supabase/server'
import { diasSuperpuestos, repartirDiasIncapacidad } from './incapacidad'
import { parseFechaLocal } from './fechas'
import { periodoLabel } from './format'
import type { PeriodoAfectadoIncapacidad } from '@/modules/payroll/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface DetalleConPeriodoRow {
  ndt_id: number
  ndt_pagado: boolean
  ndt_dias_incapacidad_empleador: number
  ndt_dias_incapacidad_ccss: number
  sgrh_nomina_periodo: {
    npe_id: number
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_quincena: number
    npe_fecha_inicio_periodo: string | null
    npe_fecha_fin_periodo: string | null
  } | null
}

export interface SincronizarAusenciaParams {
  historialLaboralId: number
  fechaInicio: string
  fechaFin: string
  /** tau_paga_empleador_dias del tipo de ausencia: tope de días que paga el
   *  patrono por mes calendario (0 si el patrono no paga nada, ej. riesgo del
   *  trabajo, y todo se reparte hacia CCSS). */
  topeMensualEmpleador: number
  /**
   * true cuando quien llama ya sabe que es un subsidio CCSS/INS (registrarIncapacidad
   * inserta INC_ENF). Sin él, el tipo se lee de la ausencia aprobada con esas fechas.
   */
  esSubsidio?: boolean
  /**
   * Solo estas filas reciben los días. Es para una fila NUEVA de un periodo
   * creado después de registrar la ausencia (ver aplicarAusenciasAFilasNuevas):
   * las demás filas ya los tienen, así que solo cuentan para el tope del mes.
   */
  soloNdtIds?: number[]
}

export type SincronizarAusenciaResult =
  | {
      ok: true
      periodosActualizados: PeriodoAfectadoIncapacidad[]
      /** Días que cayeron fuera de cualquier periodo de nómina existente. */
      diasSinPeriodo: number
      /**
       * Periodos donde la persona ya estaba pagada: no se tocaron. Cambiarles
       * los días movería el total de un comprobante ya entregado; hay que
       * resolverlos a mano (desmarcar el pago, o pagar la diferencia aparte).
       * Los días son los que le faltaron a esa fila (patrono y CCSS).
       */
      periodosPagadosOmitidos?: PeriodoAfectadoIncapacidad[]
      /**
       * true = la ausencia no es un subsidio (vacaciones, permisos) y no se
       * repartió: se paga en el salario base, no por este camino.
       */
      noAplica?: boolean
    }
  | { ok: false; error: string }

/**
 * Reparte los días de una ausencia (incapacidad o licencia con goce parcial)
 * entre los periodos de nómina de ese empleado que se traslapan con su rango
 * de fechas, respetando que el patrono no paga más de `topeMensualEmpleador`
 * días POR MES CALENDARIO — sumando lo que ya se hubiera pagado en otros
 * periodos del mismo mes (traslapen o no con ESTA ausencia en particular).
 *
 * Nota: el tope se calcula sumando ndt_dias_incapacidad_empleador ya guardado
 * en los periodos del mes, sin distinguir de qué tipo de ausencia vino cada
 * día. En el caso normal (una sola ausencia activa a la vez por empleado,
 * gracias al chequeo de traslape en sgrh_ausencias) esto es correcto. Si un
 * mismo empleado llegara a tener DOS ausencias de tipos distintos en el mismo
 * mes calendario (ej. una licencia de maternidad y, después, una incapacidad
 * por gripe), el tope de la segunda se calcularía sobre el total ya usado por
 * la primera en vez de tener su propio contador — un caso borde que, de
 * llegar a pasar, conviene revisar a mano en sgrh_nomina_detalle.
 *
 * No modifica ndt_salario_bruto: el monto se calcula al mostrarlo (días del
 * patrono × salario diario × % del catálogo), nunca se suma al bruto, para no
 * inflar aguinaldo, vacaciones ni liquidación.
 */
export async function sincronizarAusenciaEnNomina(
  supabase: SupabaseServerClient,
  {
    historialLaboralId,
    fechaInicio,
    fechaFin,
    topeMensualEmpleador,
    esSubsidio,
    soloNdtIds,
  }: SincronizarAusenciaParams
): Promise<SincronizarAusenciaResult> {
  // Este camino es para SUBSIDIOS: incapacidades y licencias certificadas por
  // la CCSS o el INS, donde el salario se suspende y el patrono paga su parte
  // aparte. Se llamaba para cualquier ausencia de día completo, así que unas
  // vacaciones terminaban anotadas como "días de incapacidad CCSS" y un
  // permiso con goce se pagaba al 50 % de la incapacidad. Vacaciones y
  // permisos se pagan en el salario base (ver horasPeriodoData).
  //
  // Si quien llama no dice el tipo, se lee de la ausencia aprobada recién
  // guardada. Si la lectura falla o no la encuentra, NO se escribe nada: anotar
  // unas vacaciones como incapacidad las paga dos veces, y un error silencioso
  // no se ve hasta el comprobante. Se devuelve error para revisarlo a mano.
  if (esSubsidio === false) {
    return { ok: true, periodosActualizados: [], diasSinPeriodo: 0, noAplica: true }
  }
  if (esSubsidio === undefined) {
    const { data: ausencias, error: errAusencias } = await supabase
      .from('sgrh_ausencias')
      .select('aus_id, sgrh_cat_tipos_ausencia ( tau_requiere_documento_ccss )')
      .eq('aus_historial_laboral_id', historialLaboralId)
      .eq('aus_fecha_inicio', fechaInicio)
      .eq('aus_fecha_fin', fechaFin)
      .eq('aus_estado', 'aprobada')
      .returns<
        {
          aus_id: number
          sgrh_cat_tipos_ausencia: { tau_requiere_documento_ccss: boolean } | null
        }[]
      >()

    const conTipo = (ausencias ?? []).filter((a) => a.sgrh_cat_tipos_ausencia !== null)
    if (errAusencias || conTipo.length === 0) {
      return {
        ok: false,
        error:
          'No se pudo confirmar el tipo de la ausencia, así que no se repartió en la planilla. Revisalo manualmente.',
      }
    }
    if (!conTipo.some((a) => a.sgrh_cat_tipos_ausencia!.tau_requiere_documento_ccss)) {
      return { ok: true, periodosActualizados: [], diasSinPeriodo: 0, noAplica: true }
    }
  }

  const { data: detalles, error: errDetalles } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `
      ndt_id,
      ndt_pagado,
      ndt_dias_incapacidad_empleador,
      ndt_dias_incapacidad_ccss,
      sgrh_nomina_periodo (
        npe_id, npe_periodo_mes, npe_periodo_anio, npe_quincena,
        npe_fecha_inicio_periodo, npe_fecha_fin_periodo
      )
    `
    )
    .eq('ndt_historial_laboral_id', historialLaboralId)
    .returns<DetalleConPeriodoRow[]>()

  if (errDetalles) {
    return {
      ok: false,
      error: 'No se pudieron actualizar los periodos de nómina. Revisalo manualmente.',
    }
  }

  const fechaInicioAus = parseFechaLocal(fechaInicio)
  const fechaFinAus = parseFechaLocal(fechaFin)
  const totalDias = diasSuperpuestos(fechaInicioAus, fechaFinAus, fechaInicioAus, fechaFinAus)

  const filas = (detalles ?? []).filter(
    (
      d
    ): d is DetalleConPeriodoRow & {
      sgrh_nomina_periodo: NonNullable<DetalleConPeriodoRow['sgrh_nomina_periodo']>
    } => d.sgrh_nomina_periodo !== null
  )

  // Días de esta ausencia que caen dentro de cada periodo existente.
  const destino = soloNdtIds ? new Set(soloNdtIds) : null
  const diasNuevosPorNdt = new Map<number, number>()
  for (const fila of filas) {
    const p = fila.sgrh_nomina_periodo
    if (!p.npe_fecha_inicio_periodo || !p.npe_fecha_fin_periodo) continue
    const dias = diasSuperpuestos(
      parseFechaLocal(p.npe_fecha_inicio_periodo),
      parseFechaLocal(p.npe_fecha_fin_periodo),
      fechaInicioAus,
      fechaFinAus
    )
    if (dias > 0) diasNuevosPorNdt.set(fila.ndt_id, dias)
  }

  const mesesTocados = new Set(
    filas
      .filter((f) => diasNuevosPorNdt.has(f.ndt_id))
      .map(
        (f) => `${f.sgrh_nomina_periodo.npe_periodo_anio}-${f.sgrh_nomina_periodo.npe_periodo_mes}`
      )
  )

  const actualizaciones: { ndt_id: number; empleador: number; ccss: number }[] = []
  const periodosActualizados: PeriodoAfectadoIncapacidad[] = []
  const periodosPagadosOmitidos: PeriodoAfectadoIncapacidad[] = []

  for (const claveMes of mesesTocados) {
    const [anioStr, mesStr] = claveMes.split('-')
    const anio = Number(anioStr)
    const mes = Number(mesStr)

    const filasDelMes = filas
      .filter(
        (f) =>
          f.sgrh_nomina_periodo.npe_periodo_anio === anio &&
          f.sgrh_nomina_periodo.npe_periodo_mes === mes
      )
      .sort((a, b) => a.sgrh_nomina_periodo.npe_quincena - b.sgrh_nomina_periodo.npe_quincena)

    // Con soloNdtIds, lo que ya tienen anotado las demás filas del mes cuenta
    // primero para el tope, estén antes o después: esos días ya se pagan.
    let usadoEsteMes = destino
      ? filasDelMes
          .filter((f) => !destino.has(f.ndt_id))
          .reduce((suma, f) => suma + f.ndt_dias_incapacidad_empleador, 0)
      : 0
    for (const fila of filasDelMes) {
      if (destino && !destino.has(fila.ndt_id)) continue
      const diasNuevos = diasNuevosPorNdt.get(fila.ndt_id) ?? 0

      if (diasNuevos === 0) {
        // No tocado por esta ausencia: su valor ya guardado cuenta para el
        // tope del mes, pero no se actualiza.
        usadoEsteMes += fila.ndt_dias_incapacidad_empleador
        continue
      }

      const totalPrevioEnPeriodo =
        fila.ndt_dias_incapacidad_empleador + fila.ndt_dias_incapacidad_ccss
      const nuevoTotalEnPeriodo = totalPrevioEnPeriodo + diasNuevos

      const reparto = repartirDiasIncapacidad(
        nuevoTotalEnPeriodo,
        usadoEsteMes,
        topeMensualEmpleador
      )

      // Una fila ya pagada no se reescribe: su comprobante ya se entregó. Lo
      // que le faltó se reporta para pagarlo aparte, y por eso cuenta para el
      // tope del mes como si se hubiera anotado: si no, la quincena siguiente
      // le cargaría al patrono días que ya se van a pagar en esa diferencia.
      if (fila.ndt_pagado) {
        usadoEsteMes += reparto.diasEmpleador
        periodosPagadosOmitidos.push({
          periodoId: fila.sgrh_nomina_periodo.npe_id,
          periodoLabel: periodoLabel(
            fila.sgrh_nomina_periodo.npe_periodo_mes,
            fila.sgrh_nomina_periodo.npe_periodo_anio,
            fila.sgrh_nomina_periodo.npe_quincena
          ),
          diasEmpleador: Math.max(0, reparto.diasEmpleador - fila.ndt_dias_incapacidad_empleador),
          diasCcss: Math.max(0, reparto.diasCcss - fila.ndt_dias_incapacidad_ccss),
        })
        continue
      }

      usadoEsteMes += reparto.diasEmpleador

      actualizaciones.push({
        ndt_id: fila.ndt_id,
        empleador: reparto.diasEmpleador,
        ccss: reparto.diasCcss,
      })
      periodosActualizados.push({
        periodoId: fila.sgrh_nomina_periodo.npe_id,
        periodoLabel: periodoLabel(
          fila.sgrh_nomina_periodo.npe_periodo_mes,
          fila.sgrh_nomina_periodo.npe_periodo_anio,
          fila.sgrh_nomina_periodo.npe_quincena
        ),
        diasEmpleador: reparto.diasEmpleador,
        diasCcss: reparto.diasCcss,
      })
    }
  }

  const resultados = await Promise.all(
    actualizaciones.map(({ ndt_id, empleador, ccss }) =>
      supabase
        .from('sgrh_nomina_detalle')
        .update({ ndt_dias_incapacidad_empleador: empleador, ndt_dias_incapacidad_ccss: ccss })
        .eq('ndt_id', ndt_id)
    )
  )
  const errActualizacion = resultados.find((r) => r.error)
  if (errActualizacion) {
    return {
      ok: false,
      error: 'No se pudieron actualizar todos los periodos de nómina. Revisalo manualmente.',
    }
  }

  const diasCubiertos = [...diasNuevosPorNdt.values()].reduce((acc, d) => acc + d, 0)
  const diasSinPeriodo = Math.max(0, totalDias - diasCubiertos)

  return {
    ok: true,
    periodosActualizados,
    diasSinPeriodo,
    ...(periodosPagadosOmitidos.length > 0 ? { periodosPagadosOmitidos } : {}),
  }
}

interface AusenciaSubsidioRow {
  aus_historial_laboral_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
  sgrh_cat_tipos_ausencia: {
    tau_requiere_documento_ccss: boolean
    tau_paga_empleador_dias: number
    tau_es_intradia: boolean
  } | null
}

/**
 * Aplica a filas RECIÉN creadas las incapacidades y licencias que ya estaban
 * registradas. sincronizarAusenciaEnNomina solo corre al registrar la
 * ausencia, sobre los periodos que existen en ese momento: un periodo creado
 * después nacía sin el subsidio del patrono (auditoría 2, fallo 2: la
 * licencia de Rebeca del 28 al 31/07 no aparecía en Jul 2.ª).
 *
 * Mismo reparto que al registrar la ausencia (tope de días del patrono por
 * mes calendario), pero solo sobre estas filas.
 */
export async function aplicarAusenciasAFilasNuevas(
  supabase: SupabaseServerClient,
  filas: { ndtId: number; labId: number }[],
  periodo: { inicio: string | null; fin: string | null }
): Promise<{ ok: true; filasConAusencias: number } | { ok: false; error: string }> {
  if (filas.length === 0 || !periodo.inicio || !periodo.fin) {
    return { ok: true, filasConAusencias: 0 }
  }

  const { data, error } = await supabase
    .from('sgrh_ausencias')
    .select(
      `aus_historial_laboral_id, aus_fecha_inicio, aus_fecha_fin,
       sgrh_cat_tipos_ausencia ( tau_requiere_documento_ccss, tau_paga_empleador_dias, tau_es_intradia )`
    )
    .in(
      'aus_historial_laboral_id',
      filas.map((f) => f.labId)
    )
    .eq('aus_estado', 'aprobada')
    .lte('aus_fecha_inicio', periodo.fin)
    .gte('aus_fecha_fin', periodo.inicio)
    .returns<AusenciaSubsidioRow[]>()

  if (error) {
    return {
      ok: false,
      error:
        'No se pudieron leer las incapacidades y licencias ya registradas: revisá los días de incapacidad de las filas nuevas.',
    }
  }

  const subsidios = (data ?? [])
    .filter(
      (a) =>
        a.sgrh_cat_tipos_ausencia?.tau_requiere_documento_ccss === true &&
        !a.sgrh_cat_tipos_ausencia.tau_es_intradia
    )
    .sort((a, b) => a.aus_fecha_inicio.localeCompare(b.aus_fecha_inicio))

  const conAusencias = new Set<number>()
  for (const ausencia of subsidios) {
    const fila = filas.find((f) => f.labId === ausencia.aus_historial_laboral_id)
    if (!fila) continue
    const sync = await sincronizarAusenciaEnNomina(supabase, {
      historialLaboralId: ausencia.aus_historial_laboral_id,
      fechaInicio: ausencia.aus_fecha_inicio,
      fechaFin: ausencia.aus_fecha_fin,
      topeMensualEmpleador: ausencia.sgrh_cat_tipos_ausencia!.tau_paga_empleador_dias,
      esSubsidio: true,
      soloNdtIds: [fila.ndtId],
    })
    if (!sync.ok) return sync
    if (sync.periodosActualizados.length > 0) conAusencias.add(fila.ndtId)
  }

  return { ok: true, filasConAusencias: conAusencias.size }
}
