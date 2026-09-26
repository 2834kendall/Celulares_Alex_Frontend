/**
 * Registro de un pago de aguinaldo o liquidación en
 * sgrh_pagos_extraordinarios, con su código de verificación.
 *
 * El pago es la fuente de verdad de "ya se pagó". Los índices únicos de la
 * tabla impiden pagarlo dos veces aunque dos personas toquen "Pagar" al mismo
 * tiempo: la segunda recibe `duplicado`.
 *
 * Solo servidor.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'
import { generarCodigoVerificacion } from './comprobante'
import type { LineaPagoExtraordinario } from '@/modules/payroll/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const INTENTOS_CODIGO = 3

export interface NuevoPagoExtraordinario {
  tipo: 'aguinaldo' | 'liquidacion'
  historialLaboralId: number
  liquidacionId?: number
  anioAguinaldo?: number
  montoBruto: number
  deducciones: number
  montoNeto: number
  lineas: LineaPagoExtraordinario[]
  fechaPago: string
  observaciones?: string | null
}

export type RegistrarPagoResult =
  | { ok: true; pagoId: number; codigo: string }
  | { ok: false; duplicado: true }
  | { ok: false; duplicado: false; error: string }

export async function registrarPagoExtraordinario(
  supabase: SupabaseServerClient,
  pago: NuevoPagoExtraordinario
): Promise<RegistrarPagoResult> {
  for (let intento = 0; intento < INTENTOS_CODIGO; intento++) {
    const codigo = generarCodigoVerificacion()
    const { data, error } = await supabase
      .from('sgrh_pagos_extraordinarios')
      .insert({
        pex_tipo: pago.tipo,
        pex_historial_laboral_id: pago.historialLaboralId,
        pex_liquidacion_id: pago.liquidacionId ?? null,
        pex_anio_aguinaldo: pago.anioAguinaldo ?? null,
        pex_monto_bruto: pago.montoBruto,
        pex_deducciones: pago.deducciones,
        pex_monto_neto: pago.montoNeto,
        pex_lineas: pago.lineas as unknown as Json,
        pex_fecha_pago: pago.fechaPago,
        pex_codigo_verificacion: codigo,
        pex_observaciones: pago.observaciones ?? null,
      })
      .select('pex_id')
      .single<{ pex_id: number }>()

    if (!error && data) return { ok: true, pagoId: data.pex_id, codigo }

    if (error?.code === '23505') {
      // Chocó el código (casi imposible): se intenta con otro. Cualquier otro
      // UNIQUE es que ese aguinaldo o esa liquidación ya estaban pagados.
      if (`${error.message ?? ''} ${error.details ?? ''}`.includes('codigo_verificacion')) continue
      return { ok: false, duplicado: true }
    }

    console.error('registrarPagoExtraordinario: no se pudo guardar el pago', error)
    return {
      ok: false,
      duplicado: false,
      error: 'No se pudo registrar el pago. Intentá de nuevo o avisá a soporte.',
    }
  }
  return {
    ok: false,
    duplicado: false,
    error: 'No se pudo generar un código de verificación único. Intentá de nuevo.',
  }
}
