'use server'

import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  enviarComprobanteExtraordinarioPorCorreo,
  enviarComprobantePorCorreo,
  type ResultadoEnvioComprobante,
} from '@/modules/payroll/lib/envioComprobante'

/**
 * Vuelve a mandar el comprobante de un pago de planilla ya marcado. Es el
 * "Reintentar" del aviso que sale cuando el correo no se pudo enviar al pagar.
 */
export async function reenviarComprobante(
  periodoId: number,
  detalleId: number
): Promise<ResultadoEnvioComprobante> {
  if (
    !Number.isInteger(periodoId) ||
    periodoId <= 0 ||
    !Number.isInteger(detalleId) ||
    detalleId <= 0
  ) {
    return { estado: 'error', error: 'el pago no es válido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)

  try {
    return await enviarComprobantePorCorreo(periodoId, detalleId)
  } catch (error) {
    console.error('[comprobante] fallo inesperado al reenviar el correo', error)
    return { estado: 'error', error: 'ocurrió un error inesperado al enviarlo.' }
  }
}

/** Lo mismo para un pago de aguinaldo o de liquidación. */
export async function reenviarComprobanteExtraordinario(
  pagoId: number
): Promise<ResultadoEnvioComprobante> {
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return { estado: 'error', error: 'el pago no es válido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)

  try {
    return await enviarComprobanteExtraordinarioPorCorreo(pagoId)
  } catch (error) {
    console.error('[comprobante] fallo inesperado al reenviar el correo', error)
    return { estado: 'error', error: 'ocurrió un error inesperado al enviarlo.' }
  }
}
