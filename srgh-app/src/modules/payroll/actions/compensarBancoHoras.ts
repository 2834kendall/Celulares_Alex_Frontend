'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ahoraLocal } from '@/modules/payroll/lib/fechas'
import type { CompensarBancoHorasResult } from '@/modules/payroll/types'
import {
  SELECT_LIQUIDACION_DEL_MOVIMIENTO,
  liquidacionQueDejoElMovimiento,
  type MovimientoConLiquidaciones,
} from '@/modules/payroll/lib/bancoHorasLiquidado'

const LARGO_MINIMO_NOTA = 5
const LARGO_MAXIMO_NOTA = 500

interface MovimientoRow extends MovimientoConLiquidaciones {
  bhm_id: number
  bhm_estado: string
}

/**
 * Compensa un movimiento pendiente del banco de horas: queda como registro
 * de que "se le dieron esas horas libres" pero NO afecta ningún cálculo de
 * planilla (el salario base es fijo, no por hora, así que no hay nada que
 * recalcular). Ver definición confirmada con el usuario en el diseño de esta
 * función.
 *
 * Las horas que una liquidación vieja dejó fuera (ver bancoHorasLiquidado)
 * solo se pueden cerrar por acá, y entonces la nota es obligatoria: tiene que
 * quedar escrito qué se hizo con ellas, porque "compensado" de alguien que
 * ya no trabaja no explica nada por sí solo.
 */
export async function compensarBancoHoras(
  bhmId: number,
  nota?: string | null
): Promise<CompensarBancoHorasResult> {
  if (!Number.isInteger(bhmId) || bhmId <= 0) {
    return { ok: false, error: 'Movimiento inválido.' }
  }
  const notaLimpia = typeof nota === 'string' ? nota.trim() : ''
  if (notaLimpia.length > LARGO_MAXIMO_NOTA) {
    return { ok: false, error: `La nota puede tener hasta ${LARGO_MAXIMO_NOTA} caracteres.` }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const usuarioId = (claims.app_metadata as { usr_id?: number })?.usr_id ?? null
  const supabase = await createClient()

  const { data: movimiento, error: errMovimiento } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .select(`bhm_id, bhm_estado, ${SELECT_LIQUIDACION_DEL_MOVIMIENTO}`)
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
  if (liquidacionQueDejoElMovimiento(movimiento) && notaLimpia.length < LARGO_MINIMO_NOTA) {
    return {
      ok: false,
      error:
        'Este empleado ya se liquidó: escribí una nota que diga qué se hizo con estas horas (por ejemplo, que se le pagaron por fuera).',
    }
  }

  // Solo si sigue pendiente, igual que pagarBancoHoras: si otra persona lo
  // pagaba al mismo tiempo, la plata ya estaba en la planilla y el
  // movimiento quedaba como 'compensado', así que revertir no la sacaba.
  const { data: resueltos, error } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .update({
      bhm_estado: 'compensado',
      bhm_resuelto_por_id: usuarioId,
      // ahoraLocal y no toISOString: la columna es `timestamp without time
      // zone` y toISOString la dejaba seis horas adelantada.
      bhm_fecha_resolucion: ahoraLocal(),
      bhm_observaciones: notaLimpia || null,
    })
    .eq('bhm_id', bhmId)
    .eq('bhm_estado', 'pendiente')
    .select('bhm_id')
    .returns<{ bhm_id: number }[]>()

  if (error) {
    return { ok: false, error: 'No se pudo registrar la compensación.' }
  }
  if (!resueltos || resueltos.length === 0) {
    return { ok: false, error: 'Este movimiento ya fue resuelto (pagado o compensado).' }
  }

  revalidatePath('/payroll/banco-horas')
  return { ok: true }
}
