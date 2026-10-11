/**
 * Horas del banco que quedaron fuera de una liquidación.
 *
 * Desde el arreglo de la auditoría (hallazgo 4) la liquidación paga las horas
 * pendientes del banco y deja el movimiento como pagado. Las liquidaciones
 * hechas ANTES de ese arreglo las dejaron pendientes: la persona ya no tiene
 * quincenas abiertas, así que no se pueden pagar por planilla. Esta función
 * las reconoce para decirlo claro en pantalla y dejar registrarlas como
 * compensadas con una nota (por ejemplo, si se le pagaron por fuera).
 *
 * Es de la misma relación laboral cuando la liquidación es posterior al
 * periodo donde se generaron las horas y el contrato del movimiento empezó
 * antes de esa salida. Un reingreso (contrato que empieza después de la
 * salida) no queda marcado.
 */

/** Columnas que necesita liquidacionQueDejoElMovimiento, para el select de PostgREST. */
export const SELECT_LIQUIDACION_DEL_MOVIMIENTO = `
  bhm_created_at,
  sgrh_historial_laboral (
    lab_fecha_inicio,
    sgrh_empleados (
      sgrh_historial_laboral ( sgrh_liquidaciones ( liq_id, liq_fecha_salida ) )
    )
  ),
  sgrh_nomina_detalle!sgrh_banco_horas_movimientos_bhm_nomina_detalle_id_fkey (
    sgrh_nomina_periodo ( npe_fecha_inicio_periodo )
  )
`

interface LiquidacionRow {
  liq_id: number
  liq_fecha_salida: string
}

export interface MovimientoConLiquidaciones {
  bhm_created_at: string
  sgrh_historial_laboral: {
    lab_fecha_inicio: string
    sgrh_empleados: {
      sgrh_historial_laboral:
        { sgrh_liquidaciones: LiquidacionRow | LiquidacionRow[] | null }[] | null
    } | null
  } | null
  sgrh_nomina_detalle: {
    sgrh_nomina_periodo: { npe_fecha_inicio_periodo: string | null } | null
  } | null
}

export interface LiquidacionDelMovimiento {
  liqId: number
  fechaSalida: string
}

/**
 * La liquidación que dejó fuera estas horas, o null si el empleado no se ha
 * liquidado después de generarlas. PostgREST devuelve la liquidación de un
 * contrato como objeto o como lista según detecte la relación 1 a 1: se
 * aceptan las dos formas.
 */
export function liquidacionQueDejoElMovimiento(
  row: MovimientoConLiquidaciones
): LiquidacionDelMovimiento | null {
  const contrato = row.sgrh_historial_laboral
  if (!contrato) return null
  const origen =
    row.sgrh_nomina_detalle?.sgrh_nomina_periodo?.npe_fecha_inicio_periodo ??
    row.bhm_created_at.slice(0, 10)

  const liquidaciones = (contrato.sgrh_empleados?.sgrh_historial_laboral ?? []).flatMap((c) =>
    c.sgrh_liquidaciones === null
      ? []
      : Array.isArray(c.sgrh_liquidaciones)
        ? c.sgrh_liquidaciones
        : [c.sgrh_liquidaciones]
  )

  const candidata = liquidaciones
    .filter((l) => l.liq_fecha_salida >= origen && contrato.lab_fecha_inicio <= l.liq_fecha_salida)
    .sort((a, b) => a.liq_fecha_salida.localeCompare(b.liq_fecha_salida))[0]

  return candidata ? { liqId: candidata.liq_id, fechaSalida: candidata.liq_fecha_salida } : null
}
