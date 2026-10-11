/**
 * Qué dice el comprobante de un pago de aguinaldo o de liquidación: título,
 * subtítulo, líneas por bloque y la nota de cargas sociales.
 *
 * Lo usan la página /comprobante/extraordinario/[pagoId] y el PDF que se le
 * manda por correo al empleado al pagar (lib/comprobantePdf.ts), para que el
 * papel impreso y el adjunto digan exactamente lo mismo.
 */

import type { PagoExtraordinario } from '@/modules/payroll/types'
import { formatDate, nombreAguinaldo } from '@/modules/payroll/lib/format'

export interface LineaExtraordinaria {
  label: string
  monto: number
}

export interface ContenidoComprobanteExtraordinario {
  titulo: string
  subtitulo: string
  /** Datos que explican el cálculo (promedio, días...): no se suman. */
  informativas: LineaExtraordinaria[]
  rubros: LineaExtraordinaria[]
  deducciones: LineaExtraordinaria[]
  /** Por qué el pago no lleva (o casi no lleva) cargas sociales. */
  nota: string
}

export function armarComprobanteExtraordinario(
  pago: Pick<
    PagoExtraordinario,
    'tipo' | 'anioAguinaldo' | 'fechaSalida' | 'motivoSalida' | 'lineas'
  >
): ContenidoComprobanteExtraordinario {
  const titulo =
    pago.tipo === 'aguinaldo'
      ? pago.anioAguinaldo
        ? `Comprobante de pago del ${nombreAguinaldo(pago.anioAguinaldo).toLowerCase()}`
        : 'Comprobante de pago de aguinaldo'
      : 'Comprobante de liquidación'
  const subtitulo =
    pago.tipo === 'aguinaldo' && pago.anioAguinaldo
      ? `Cubre del 1 de diciembre de ${pago.anioAguinaldo - 1} al 30 de noviembre de ${pago.anioAguinaldo}`
      : `Salida: ${formatDate(pago.fechaSalida)}${pago.motivoSalida ? ` · ${pago.motivoSalida}` : ''}`

  const informativas = pago.lineas
    .filter((l) => l.informativo)
    .map((l) => ({ label: l.concepto, monto: l.monto }))
  const rubros = pago.lineas
    .filter((l) => !l.informativo && !l.deduccion)
    .map((l) => ({
      label:
        l.dias !== null && l.dias !== undefined ? `${l.concepto} (${l.dias} días)` : l.concepto,
      monto: l.monto,
    }))
  const deducciones = pago.lineas
    .filter((l) => l.deduccion && l.monto > 0)
    .map((l) => ({ label: l.concepto, monto: l.monto }))

  const nota =
    pago.tipo === 'liquidacion'
      ? 'Preaviso, cesantía y la indemnización por contrato a plazo fijo son indemnizaciones, y el aguinaldo está exento: no llevan cuota obrera.'
      : 'El aguinaldo no lleva cargas sociales ni impuesto sobre la renta (Ley 2412).'

  return { titulo, subtitulo, informativas, rubros, deducciones, nota }
}
