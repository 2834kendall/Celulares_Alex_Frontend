// Efecto secundario compartido entre la edición manual (updateDetalleManual.ts)
// y la subida de Excel (uploadPlanilla.ts): cada vez que se guardan las horas
// trabajadas de un empleado en un periodo, se sincroniza el movimiento
// "pendiente" del banco de horas para ese periodo (ver lib/bancoHoras.ts).
//
// Un ndt_id (detalle de planilla) tiene como máximo un movimiento de banco de
// horas asociado (columna UNIQUE en la base). Mientras ese movimiento siga
// "pendiente", se actualiza junto con el detalle; si ya se pagó o se
// compensó, queda como historial y no se vuelve a tocar aunque el admin
// edite las horas de ese periodo después.

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { round2 } from '@/modules/payroll/lib/numeros'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface SincronizarBancoHorasParams {
  ndtId: number
  historialLaboralId: number
  /** Horas por encima de la jornada programada, ya calculadas. */
  horasExtra: number
  salarioPorHora: number
}

interface MovimientoExistenteRow {
  bhm_id: number
  bhm_estado: string
}

export async function sincronizarMovimientoBancoHoras(
  supabase: SupabaseServerClient,
  params: SincronizarBancoHorasParams
): Promise<{ error: string | null }> {
  const horasExtra = Math.max(0, round2(params.horasExtra))

  const { data: existente, error: errExistente } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .select('bhm_id, bhm_estado')
    .eq('bhm_nomina_detalle_id', params.ndtId)
    .maybeSingle<MovimientoExistenteRow>()

  if (errExistente) {
    return { error: 'No se pudo revisar el banco de horas.' }
  }

  if (horasExtra <= 0) {
    // Ya no hay horas extra en este periodo (ej. se corrigieron las horas a
    // la baja): si había un movimiento pendiente, se elimina. Uno ya resuelto
    // (pagado/compensado) es historial y no se toca.
    if (existente && existente.bhm_estado === 'pendiente') {
      const { error } = await supabase
        .from('sgrh_banco_horas_movimientos')
        .delete()
        .eq('bhm_id', existente.bhm_id)
      if (error) return { error: 'No se pudo actualizar el banco de horas.' }
    }
    return { error: null }
  }

  if (!existente) {
    const { error } = await supabase.from('sgrh_banco_horas_movimientos').insert({
      bhm_historial_laboral_id: params.historialLaboralId,
      bhm_nomina_detalle_id: params.ndtId,
      bhm_horas: horasExtra,
      bhm_salario_por_hora: params.salarioPorHora,
    })
    if (error) return { error: 'No se pudo registrar en el banco de horas.' }
    return { error: null }
  }

  if (existente.bhm_estado === 'pendiente') {
    const { error } = await supabase
      .from('sgrh_banco_horas_movimientos')
      .update({ bhm_horas: horasExtra, bhm_salario_por_hora: params.salarioPorHora })
      .eq('bhm_id', existente.bhm_id)
    if (error) return { error: 'No se pudo actualizar el banco de horas.' }
  }

  return { error: null }
}
