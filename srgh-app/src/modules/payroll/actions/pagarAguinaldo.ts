'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { hoyLocal } from '@/modules/payroll/lib/fechas'
import { formatDate } from '@/modules/payroll/lib/format'
import { ERROR_SIN_PERMISO_AUSENCIAS, puedeLeerAusencias } from '@/modules/payroll/lib/derechosData'
import {
  aperturaPagoAguinaldo,
  calcularAguinaldosDelCiclo,
} from '@/modules/payroll/lib/aguinaldoData'
import { registrarPagoExtraordinario } from '@/modules/payroll/lib/pagosExtraordinarios'
import type { LineaPagoExtraordinario } from '@/modules/payroll/types'

export type PagarAguinaldoResult = { ok: true; pagoId: number } | { ok: false; error: string }

/**
 * Paga el aguinaldo de un ciclo a una persona: registra el pago con su
 * comprobante (sgrh_pagos_extraordinarios) con el monto congelado. No depende
 * de ningún periodo de planilla, así que sirve igual para quien sigue
 * trabajando y para quien salió después del cierre del ciclo.
 *
 * El monto es el mismo que muestra la pestaña (lib/aguinaldoData.ts). Antes
 * de pagar se exige que:
 *  - el ciclo haya cerrado (desde el 1 de diciembre): pagarlo antes dejaría
 *    fuera lo que falta devengar hasta el 30 de noviembre;
 *  - no queden quincenas del ciclo sin pagar: no entrarían en el monto;
 *  - tenga el mes continuo que exige la ley;
 *  - no esté ya pagado.
 */
export async function pagarAguinaldo(
  historialLaboralId: number,
  anio: number
): Promise<PagarAguinaldoResult> {
  if (!Number.isInteger(historialLaboralId) || historialLaboralId <= 0) {
    return { ok: false, error: 'Empleado inválido.' }
  }
  if (!Number.isInteger(anio) || anio < 2000) {
    return { ok: false, error: 'Año inválido.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  if (!puedeLeerAusencias(claims)) {
    return { ok: false, error: ERROR_SIN_PERMISO_AUSENCIAS }
  }

  const hoy = hoyLocal()
  const apertura = aperturaPagoAguinaldo(anio)
  if (hoy < apertura) {
    return {
      ok: false,
      error: `El ciclo ${anio - 1}-${anio} cierra el 30 de noviembre: su aguinaldo se paga desde el ${formatDate(apertura)} (y a más tardar el 20 de diciembre).`,
    }
  }

  const supabase = await createClient()
  const resultado = await calcularAguinaldosDelCiclo(supabase, anio, historialLaboralId)
  if (!resultado.ok) return resultado

  const aguinaldo = resultado.data.find((a) => a.labId === historialLaboralId)
  if (!aguinaldo) {
    return {
      ok: false,
      error:
        'Este empleado no tiene aguinaldo en este ciclo: o entró después del 30 de noviembre, o salió antes y su aguinaldo va en la liquidación.',
    }
  }
  if (aguinaldo.pagado) {
    return { ok: false, error: 'Este aguinaldo ya estaba pagado.' }
  }
  if (aguinaldo.calculo.sinPagar.length > 0) {
    return {
      ok: false,
      error: `Hay quincenas del ciclo sin marcar como pagadas (${aguinaldo.calculo.sinPagar.join(', ')}). Pagalas por planilla primero: si no, quedarían fuera del aguinaldo.`,
    }
  }
  if (!aguinaldo.calculo.elegible) {
    return {
      ok: false,
      error:
        'No le corresponde aguinaldo de este ciclo: al 30 de noviembre no tenía un mes laborado en forma continua, que es el mínimo que exige la ley (MTSS).',
    }
  }
  if (aguinaldo.ausenciasSinTipo > 0) {
    return {
      ok: false,
      error:
        'Tiene ausencias aprobadas cuyo tipo no se pudo leer: no se puede saber si alguna es licencia de maternidad, que cuenta para el aguinaldo. Revisalas en Ausencias.',
    }
  }
  if (aguinaldo.calculo.monto <= 0) {
    return { ok: false, error: 'No hay salario pagado en este ciclo: el aguinaldo es ₡0.' }
  }

  const { monto, sumaSalarios, maternidad } = aguinaldo.calculo
  const lineas: LineaPagoExtraordinario[] = [
    {
      concepto: `Salario del ciclo (1 dic ${anio - 1} al 30 nov ${anio})`,
      dias: null,
      monto: sumaSalarios,
      informativo: true,
    },
    ...(maternidad > 0
      ? [
          {
            concepto: 'Incluye licencia de maternidad (cuenta como salario)',
            dias: null,
            monto: maternidad,
            informativo: true,
          },
        ]
      : []),
    { concepto: 'Aguinaldo (salario del ciclo ÷ 12)', dias: null, monto },
  ]

  const pago = await registrarPagoExtraordinario(supabase, {
    tipo: 'aguinaldo',
    historialLaboralId,
    anioAguinaldo: anio,
    montoBruto: monto,
    // El aguinaldo está exento de cargas sociales y de renta (Ley 2412).
    deducciones: 0,
    montoNeto: monto,
    lineas,
    fechaPago: hoy,
  })
  if (!pago.ok) {
    return pago.duplicado
      ? { ok: false, error: 'Este aguinaldo ya estaba pagado.' }
      : { ok: false, error: pago.error }
  }

  // La provisión también queda marcada, para lo que todavía la lea. Es de
  // mejor esfuerzo: el pago con comprobante ya es la fuente de verdad.
  const { data: provision } = await supabase
    .from('sgrh_provisiones_anuales')
    .select('pra_id')
    .eq('pra_historial_laboral_id', historialLaboralId)
    .eq('pra_anio', anio)
    .maybeSingle<{ pra_id: number }>()
  if (provision) {
    await supabase
      .from('sgrh_provisiones_anuales')
      .update({ pra_aguinaldo_pagado: true, pra_fecha_pago_aguinaldo: hoy })
      .eq('pra_id', provision.pra_id)
  } else {
    await supabase.from('sgrh_provisiones_anuales').insert({
      pra_historial_laboral_id: historialLaboralId,
      pra_anio: anio,
      pra_monto_acumulado_aguinaldo: monto,
      pra_aguinaldo_pagado: true,
      pra_fecha_pago_aguinaldo: hoy,
    })
  }

  revalidatePath('/payroll/aguinaldo-liquidacion')
  return { ok: true, pagoId: pago.pagoId }
}
