'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { CompensarBancoHorasResult } from '@/modules/payroll/types'

interface MovimientoRow {
  bhm_id: number
  bhm_estado: string
}

/**
 * Compensa un movimiento pendiente del banco de horas: queda como registro
 * de que "se le dieron esas horas libres" pero NO afecta ningún cálculo de
 * planilla (el salario base es fijo, no por hora, así que no hay nada que
 * recalcular). Ver definición confirmada con el usuario en el diseño de esta
 * función.
 */
export async function compensarBancoHoras(bhmId: number): Promise<CompensarBancoHorasResult> {
  if (!Number.isInteger(bhmId) || bhmId <= 0) {
    return { ok: false, error: 'Movimiento inválido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: movimiento, error: errMovimiento } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .select('bhm_id, bhm_estado')
    .eq('bhm_id', bhmId)
    .maybeSingle<MovimientoRow>()

  if (errMovimiento) {
    return { ok: false, error: 'No se pudo cargar el movimiento del banco de horas.' }
  }
  if (!movimiento) {
    return { ok: false, error: 'El movimiento no existe o no es visible.' }
  }
  if (movimiento.bhm_estado !== 'pendiente') {
    return { ok: false, error: 'Este movimiento ya fue resuelto (pagado o compensado).' }
  }

  const { error } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .update({
      bhm_estado: 'compensado',
      bhm_fecha_resolucion: new Date().toISOString(),
    })
    .eq('bhm_id', bhmId)

  if (error) {
    return { ok: false, error: 'No se pudo registrar la compensación.' }
  }

  revalidatePath('/payroll/banco-horas')
  return { ok: true }
}
