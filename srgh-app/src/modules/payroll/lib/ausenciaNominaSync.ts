import type { createClient } from '@/lib/supabase/server'
import { diasSuperpuestos, parseFechaLocal, repartirDiasIncapacidad } from './incapacidad'
import { periodoLabel } from './format'
import type { PeriodoAfectadoIncapacidad } from '@/modules/payroll/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface DetalleConPeriodoRow {
  ndt_id: number
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
}

export type SincronizarAusenciaResult =
  | {
      ok: true
      periodosActualizados: PeriodoAfectadoIncapacidad[]
      /** Días que cayeron fuera de cualquier periodo de nómina existente. */
      diasSinPeriodo: number
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
  { historialLaboralId, fechaInicio, fechaFin, topeMensualEmpleador }: SincronizarAusenciaParams
): Promise<SincronizarAusenciaResult> {
  const { data: detalles, error: errDetalles } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `
      ndt_id,
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

    let usadoEsteMes = 0
    for (const fila of filasDelMes) {
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

  return { ok: true, periodosActualizados, diasSinPeriodo }
}
