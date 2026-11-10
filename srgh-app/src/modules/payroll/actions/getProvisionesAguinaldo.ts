'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { ERROR_FILTRO_MARCA, getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { PERMISOS } from '@/lib/permissions/catalog'
import { puedeLeerAusencias, sucursalesVisibles } from '@/modules/payroll/lib/derechosData'
import { calcularAguinaldosDelCiclo } from '@/modules/payroll/lib/aguinaldoData'
import type { AguinaldoItem } from '@/modules/payroll/types'
import { hoyLocal } from '@/modules/payroll/lib/fechas'
import { anulableHasta, leerHorasParaAnular } from '@/modules/payroll/lib/anulacionPagos'

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
 *
 * La marca elegida filtra DESPUÉS de calcular. Pasarla como `visibles` dejaría a
 * una persona trasladada con `sucursalesOcultas`: monto de menos y sin poder pagar.
 */
export async function getProvisionesAguinaldo(
  anioCiclo?: number
): Promise<GetProvisionesAguinaldoResult> {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)

  const filtro = await getFiltroMarca()
  if (filtro.estado === 'error') return { ok: false, error: ERROR_FILTRO_MARCA }

  const supabase = await createClient()
  // Año de Costa Rica: desde las 18:00 del 31 de diciembre, el del servidor
  // (UTC) ya es el siguiente y mostraba el ciclo equivocado.
  const anio = anioCiclo ?? Number(hoyLocal().slice(0, 4))

  const [resultado, horasParaAnular] = await Promise.all([
    calcularAguinaldosDelCiclo(supabase, anio, sucursalesVisibles(claims)),
    leerHorasParaAnular(supabase),
  ])
  if (!resultado.ok) return resultado

  const { sucursalIds } = filtro
  const filas = sucursalIds
    ? resultado.data.filter((a) => a.sucursalId !== null && sucursalIds.includes(a.sucursalId))
    : resultado.data

  const items: AguinaldoItem[] = filas.map((a) => ({
    historialLaboralId: a.labId,
    empleadoNombre: a.empleadoNombre,
    empleadoCedula: a.empleadoCedula,
    empleadoEmail: a.empleadoEmail,
    anio,
    monto: a.montoPagado ?? a.calculo.monto,
    maternidad: a.calculo.maternidad,
    elegible: a.calculo.elegible,
    quincenasSinPagar: a.calculo.sinPagar,
    ausenciasSinTipo: a.ausenciasSinTipo,
    sucursalesOcultas: a.sucursalesOcultas,
    pagado: a.pagado,
    fechaPago: a.fechaPago,
    pagoId: a.pagoId,
    fechaSalida: a.fechaSalida,
    anulableHasta:
      a.pagoId && a.pagadoEn
        ? anulableHasta({ pex_pagado_en: a.pagadoEn, pex_anulado_en: null }, horasParaAnular)
        : null,
    ultimaAnulacion: a.ultimaAnulacion,
  }))

  return { ok: true, data: { anio, items, puedeLeerAusencias: puedeLeerAusencias(claims) } }
}
