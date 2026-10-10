'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { hoyLocal } from '@/modules/payroll/lib/fechas'
import { registrarPagoExtraordinario } from '@/modules/payroll/lib/pagosExtraordinarios'
import type { LineaPagoExtraordinario } from '@/modules/payroll/types'

export type PagarLiquidacionResult = { ok: true; pagoId: number } | { ok: false; error: string }

interface LiquidacionRow {
  liq_id: number
  liq_historial_laboral_id: number
  liq_pagado: boolean
  liq_dias_trabajados_mes: number
  liq_salario_proporcional: number
  liq_aguinaldo_proporcional: number
  liq_dias_vacaciones_pendientes: number
  liq_vacaciones_pagadas: number
  liq_horas_extra_banco: number | null
  liq_dias_preaviso: number
  liq_preaviso: number
  liq_dias_cesantia: number
  liq_cesantia: number
  liq_nota_preaviso: string | null
  liq_nota_cesantia: string | null
  liq_dias_indemnizacion_plazo_fijo: number | null
  liq_indemnizacion_plazo_fijo: number | null
  liq_total: number
  liq_deducciones_obreras: number
  liq_neto: number | null
  liq_observaciones: string | null
}

/**
 * Paga una liquidación ya calculada: registra el pago con su comprobante
 * (sgrh_pagos_extraordinarios) y la marca pagada. No toca ningún periodo de
 * planilla: la persona ya no trabaja, y su finiquito no tiene por qué esperar
 * ni colgarse de una quincena.
 *
 * Los montos NO se recalculan: se paga exactamente lo que quedó guardado al
 * procesar la salida, que es lo que la persona vio y firmó.
 *
 * Antes liq_pagado no lo escribía nadie y toda liquidación quedaba
 * "Pendiente de pago" para siempre.
 */
export async function pagarLiquidacion(liqId: number): Promise<PagarLiquidacionResult> {
  if (!Number.isInteger(liqId) || liqId <= 0) {
    return { ok: false, error: 'Liquidación inválida.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: liq, error: errLiq } = await supabase
    .from('sgrh_liquidaciones')
    .select(
      `liq_id, liq_historial_laboral_id, liq_pagado, liq_dias_trabajados_mes,
       liq_salario_proporcional, liq_aguinaldo_proporcional, liq_dias_vacaciones_pendientes,
       liq_vacaciones_pagadas, liq_horas_extra_banco, liq_dias_preaviso, liq_preaviso, liq_dias_cesantia, liq_cesantia,
       liq_nota_preaviso, liq_nota_cesantia, liq_dias_indemnizacion_plazo_fijo,
       liq_indemnizacion_plazo_fijo, liq_total, liq_deducciones_obreras, liq_neto, liq_observaciones`
    )
    .eq('liq_id', liqId)
    .maybeSingle<LiquidacionRow>()

  if (errLiq) return { ok: false, error: 'No se pudo cargar la liquidación.' }
  if (!liq) return { ok: false, error: 'La liquidación no existe o no es visible.' }
  if (liq.liq_pagado) return { ok: false, error: 'Esta liquidación ya estaba pagada.' }

  const neto = liq.liq_neto ?? liq.liq_total
  const horasExtra = Number(liq.liq_horas_extra_banco ?? 0)
  const indemnizacionPlazoFijo = Number(liq.liq_indemnizacion_plazo_fijo ?? 0)
  const lineas: LineaPagoExtraordinario[] = [
    {
      concepto: 'Salario pendiente',
      dias: liq.liq_dias_trabajados_mes,
      monto: liq.liq_salario_proporcional,
    },
    { concepto: 'Aguinaldo proporcional', dias: null, monto: liq.liq_aguinaldo_proporcional },
    {
      concepto: 'Vacaciones no disfrutadas',
      dias: liq.liq_dias_vacaciones_pendientes,
      monto: liq.liq_vacaciones_pagadas,
    },
    // Horas extra que seguían en el banco de horas al salir (auditoría,
    // hallazgo 4). Solo aparece si las hubo.
    ...(horasExtra > 0
      ? [{ concepto: 'Horas extra pendientes (banco de horas)', dias: null, monto: horasExtra }]
      : []),
    // Con 0 días se dice por qué (auditoría 2, hallazgo 10).
    {
      concepto: liq.liq_nota_preaviso ? `Preaviso: ${liq.liq_nota_preaviso}` : 'Preaviso',
      dias: liq.liq_dias_preaviso,
      monto: liq.liq_preaviso,
    },
    {
      concepto: liq.liq_nota_cesantia ? `Cesantía: ${liq.liq_nota_cesantia}` : 'Cesantía',
      dias: liq.liq_dias_cesantia,
      monto: liq.liq_cesantia,
    },
    ...(indemnizacionPlazoFijo > 0
      ? [
          {
            concepto: 'Indemnización por contrato a plazo fijo (Art. 31)',
            dias: Number(liq.liq_dias_indemnizacion_plazo_fijo ?? 0),
            monto: indemnizacionPlazoFijo,
          },
        ]
      : []),
    {
      concepto:
        horasExtra > 0
          ? 'Cuota obrera CCSS (sobre salario pendiente, vacaciones y horas extra)'
          : 'Cuota obrera CCSS (sobre salario pendiente y vacaciones)',
      dias: null,
      monto: liq.liq_deducciones_obreras,
      deduccion: true,
    },
  ]

  const hoy = hoyLocal()
  const pago = await registrarPagoExtraordinario(supabase, {
    tipo: 'liquidacion',
    historialLaboralId: liq.liq_historial_laboral_id,
    liquidacionId: liq.liq_id,
    montoBruto: liq.liq_total,
    deducciones: liq.liq_deducciones_obreras,
    montoNeto: neto,
    lineas,
    fechaPago: hoy,
    observaciones: liq.liq_observaciones,
  })
  if (!pago.ok) {
    return pago.duplicado
      ? { ok: false, error: 'Esta liquidación ya estaba pagada.' }
      : { ok: false, error: pago.error }
  }

  // El pago ya quedó (es la fuente de verdad). Si marcar la liquidación
  // falla, la pantalla igual la ve pagada por el pago; no se deshace nada.
  const { error: errMarca } = await supabase
    .from('sgrh_liquidaciones')
    .update({ liq_pagado: true, liq_fecha_pago: hoy })
    .eq('liq_id', liq.liq_id)
  if (errMarca) {
    console.error('pagarLiquidacion: pago registrado pero liq_pagado no se actualizó', errMarca)
  }

  revalidatePath('/payroll/aguinaldo-liquidacion')
  return { ok: true, pagoId: pago.pagoId }
}
