/**
 * Textos de la confirmación antes de pagar y del aviso después, sobre el
 * correo del comprobante. Los comparten la planilla (PeriodoDetail), el
 * aguinaldo (AguinaldoTab) y la liquidación (LiquidacionesHistorial), para que
 * los tres pagos digan lo mismo de la misma forma.
 */

import { toast } from 'sonner'
import type { ResultadoEnvioComprobante } from '@/modules/payroll/lib/envioComprobante'

/**
 * Mensaje de la confirmación: `base` dice qué se va a pagar ("Se registrará
 * el pago de ₡X a Ana") y acá se completa con qué pasa con el comprobante.
 */
export function mensajeConfirmarPago(
  base: string,
  email: string | null,
  correoConfigurado: boolean
): string {
  if (!correoConfigurado) {
    return `${base}. El envío de comprobantes por correo no está configurado, así que habrá que entregárselo impreso.`
  }
  if (!email) {
    return `${base}. No tiene correo registrado en su expediente, así que el comprobante no se le puede enviar: habrá que entregárselo impreso.`
  }
  return `${base} y se le enviará el comprobante en PDF a ${email}.`
}

/**
 * Aviso después de pagar. `prefijo` dice qué quedó pagado ("Pago
 * registrado", "Aguinaldo de Ana pagado"). Si el correo falló, el aviso
 * queda más tiempo y ofrece reintentar.
 */
export function avisarCorreoComprobante(
  prefijo: string,
  empleadoNombre: string,
  correo: ResultadoEnvioComprobante | undefined,
  reintentar: () => void
) {
  if (!correo || correo.estado === 'sin_configurar') {
    toast.success(`${prefijo}. Ya puedes ver e imprimir el comprobante.`)
    return
  }
  if (correo.estado === 'enviado') {
    toast.success(`${prefijo}. Comprobante enviado a ${correo.email}.`)
    return
  }
  if (correo.estado === 'sin_email') {
    toast.warning(
      `${prefijo}. ${empleadoNombre} no tiene correo registrado: entrégale el comprobante impreso.`
    )
    return
  }
  toast.warning(`${prefijo}, pero el comprobante no se pudo enviar: ${correo.error}`, {
    duration: 15_000,
    action: { label: 'Reintentar', onClick: reintentar },
  })
}
