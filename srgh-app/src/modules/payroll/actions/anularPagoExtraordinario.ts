'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  LARGO_MAXIMO_MOTIVO,
  LARGO_MINIMO_MOTIVO,
} from '@/modules/payroll/lib/anulacionPagosReglas'

export type AnularPagoExtraordinarioResult = { ok: true } | { ok: false; error: string }

/**
 * Errores que la función de la base levanta a propósito, con un mensaje
 * pensado para la pantalla (ver la migración 20261107130000). Cualquier otro
 * error se muestra genérico: no se le enseña un mensaje técnico al usuario.
 */
const ERRORES_CON_MENSAJE = new Set(['42501', '22023', '55000', 'P0002'])

/**
 * Anula un pago de aguinaldo o de liquidación hecho por error, dentro del
 * plazo de la empresa (Configuración → General) y con un motivo. Todo lo
 * decide y lo hace la base en una sola transacción (anular_pago_extraordinario):
 * el pago queda en el historial como anulado, el aguinaldo o la liquidación
 * vuelven a "sin pagar" y se pueden volver a pagar con un comprobante nuevo.
 * Los montos de la liquidación guardada no cambian.
 */
export async function anularPagoExtraordinario(
  pagoId: number,
  motivo: string
): Promise<AnularPagoExtraordinarioResult> {
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return { ok: false, error: 'Pago inválido.' }
  }
  const texto = typeof motivo === 'string' ? motivo.trim() : ''
  if (texto.length < LARGO_MINIMO_MOTIVO) {
    return {
      ok: false,
      error: `Escribí el motivo de la anulación (al menos ${LARGO_MINIMO_MOTIVO} caracteres).`,
    }
  }
  if (texto.length > LARGO_MAXIMO_MOTIVO) {
    return {
      ok: false,
      error: `El motivo no puede pasar de ${LARGO_MAXIMO_MOTIVO} caracteres.`,
    }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { error } = await supabase.rpc('anular_pago_extraordinario', {
    p_pex_id: pagoId,
    p_motivo: texto,
  })
  if (error) {
    if (error.code && ERRORES_CON_MENSAJE.has(error.code) && error.message) {
      return { ok: false, error: error.message }
    }
    console.error('anularPagoExtraordinario: la base rechazó la anulación', error)
    return { ok: false, error: 'No se pudo anular el pago. Intentá de nuevo.' }
  }

  revalidatePath('/payroll/aguinaldo-liquidacion')
  revalidatePath(`/comprobante/extraordinario/${pagoId}`)
  revalidatePath('/payroll')
  return { ok: true }
}
