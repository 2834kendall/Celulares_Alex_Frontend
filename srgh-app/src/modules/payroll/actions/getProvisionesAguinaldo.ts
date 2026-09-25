'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { puedeLeerAusencias } from '@/modules/payroll/lib/derechosData'
import { calcularAguinaldosDelCiclo } from '@/modules/payroll/lib/aguinaldoData'
import type { AguinaldoItem } from '@/modules/payroll/types'

export type GetProvisionesAguinaldoResult =
  | {
      ok: true
      data: {
        anio: number
        items: AguinaldoItem[]
        /**
         * false = el usuario no puede leer ausencias: los montos no ven la
         * licencia de maternidad y no se deja pagar (ver pagarAguinaldo).
         */
        puedeLeerAusencias: boolean
      }
    }
  | { ok: false; error: string }

/**
 * Aguinaldo del ciclo `anioCiclo` (por defecto el del año en curso) para cada
 * persona a la que se le debe (ver lib/aguinaldoData.ts).
 *
 * El ciclo N va del 1 de diciembre de N−1 al 30 de noviembre de N y se paga
 * en diciembre de N. Por eso el ciclo por defecto es el del AÑO EN CURSO,
 * todo el año: de enero a noviembre es el que se está acumulando, y en
 * diciembre es el que hay que pagar antes del día 20. Las quincenas de
 * diciembre ya cuentan para el ciclo siguiente.
 */
export async function getProvisionesAguinaldo(
  anioCiclo?: number
): Promise<GetProvisionesAguinaldoResult> {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)

  const supabase = await createClient()
  const anio = anioCiclo ?? new Date().getFullYear()

  const resultado = await calcularAguinaldosDelCiclo(supabase, anio)
  if (!resultado.ok) return resultado

  const items: AguinaldoItem[] = resultado.data.map((a) => ({
    historialLaboralId: a.labId,
    empleadoNombre: a.empleadoNombre,
    empleadoCedula: a.empleadoCedula,
    anio,
    monto: a.montoPagado ?? a.calculo.monto,
    maternidad: a.calculo.maternidad,
    elegible: a.calculo.elegible,
    quincenasSinPagar: a.calculo.sinPagar,
    pagado: a.pagado,
    fechaPago: a.fechaPago,
    pagoId: a.pagoId,
    fechaSalida: a.fechaSalida,
  }))

  return { ok: true, data: { anio, items, puedeLeerAusencias: puedeLeerAusencias(claims) } }
}
