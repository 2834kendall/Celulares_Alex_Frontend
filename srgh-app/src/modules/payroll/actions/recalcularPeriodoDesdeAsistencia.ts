'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { refrescarHorasAsistencia } from '@/modules/payroll/actions/refrescarHorasAsistencia'

/** Una fila que quedó como estaba, con el motivo para poder ir a arreglarlo. */
export interface FilaOmitida {
  nombre: string
  motivo: string
}

export type RecalcularPeriodoResult =
  | {
      ok: true
      /** Filas que cambiaron de monto u horas. */
      recalculadas: number
      /** Filas que ya estaban bien: no se tocó nada. */
      yaEstaban: number
      omitidas: FilaOmitida[]
    }
  | { ok: false; error: string }

interface DetalleRow {
  ndt_id: number
  ndt_pagado: boolean
  sgrh_historial_laboral: {
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
    } | null
  } | null
}

interface PeriodoRow {
  npe_id: number
  npe_estado: string
}

/**
 * Recalcula TODAS las filas del periodo con lo que dice la asistencia.
 *
 * Existe porque la planilla guarda montos, no fórmulas: el valor de la hora, el
 * salario bruto y el neto quedan escritos en la fila cuando se arma. Arreglar
 * el cálculo en el código no toca una fila que ya está guardada —sigue
 * mostrando el número viejo hasta que alguien la vuelva a calcular— y eso hizo
 * que un periodo armado antes del arreglo siguiera enseñando un valor hora de
 * ₡26.111 y un total a pagar de ₡0 aunque el código ya estuviera corregido.
 *
 * Fila por fila ya se podía (el botón "traer … h" de cada empleado), pero eso
 * obliga a encontrar un enlace chiquito por persona y a saber de antemano
 * cuáles están mal. Acá se hace de una sola vez y se dice qué pasó con cada
 * una.
 *
 * Usa exactamente la misma acción de una fila —no hay una segunda copia de la
 * cuenta— así que respeta lo mismo que ella: no toca filas pagadas, no toca
 * periodos fuera de borrador y NO pisa unas horas corregidas a mano (esas se
 * reportan como omitidas, para que quien las corrigió decida).
 */
export async function recalcularPeriodoDesdeAsistencia(
  periodoId: number
): Promise<RecalcularPeriodoResult> {
  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return { ok: false, error: 'Periodo inválido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: periodo, error: errPeriodo } = await supabase
    .from('sgrh_nomina_periodo')
    .select('npe_id, npe_estado')
    .eq('npe_id', periodoId)
    .maybeSingle<PeriodoRow>()

  if (errPeriodo) {
    return { ok: false, error: 'No se pudo cargar el periodo.' }
  }
  if (!periodo) {
    return { ok: false, error: 'El periodo no existe o no es visible.' }
  }
  // Se adelanta el mismo corte que hace la acción de una fila, para dar un
  // motivo en vez de repetirlo una vez por empleado.
  if (periodo.npe_estado !== 'borrador') {
    return {
      ok: false,
      error:
        'Solo se puede recalcular un periodo en borrador. Este ya está cerrado: sus montos son los que se pagaron.',
    }
  }

  const { data: detalles, error: errDetalles } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `ndt_id, ndt_pagado,
       sgrh_historial_laboral ( sgrh_empleados ( emp_nombre, emp_apellido_1 ) )`
    )
    .eq('ndt_nomina_periodo_id', periodoId)
    .order('ndt_id', { ascending: true })
    .returns<DetalleRow[]>()

  if (errDetalles) {
    return { ok: false, error: 'No se pudo cargar la planilla del periodo.' }
  }
  if (!detalles || detalles.length === 0) {
    return {
      ok: false,
      error: 'Este periodo no tiene empleados todavía. Cargalos desde la asistencia primero.',
    }
  }

  let recalculadas = 0
  let yaEstaban = 0
  const omitidas: FilaOmitida[] = []

  // En serie a propósito: cada fila borra y reinserta sus líneas, y además
  // sincroniza su movimiento del banco de horas. En paralelo serían escrituras
  // cruzadas sobre las mismas tablas sin transacción que las ordene.
  for (const detalle of detalles) {
    const empleado = detalle.sgrh_historial_laboral?.sgrh_empleados
    const nombre = empleado
      ? `${empleado.emp_nombre} ${empleado.emp_apellido_1}`.trim()
      : `Detalle ${detalle.ndt_id}`

    if (detalle.ndt_pagado) {
      omitidas.push({ nombre, motivo: 'ya se le marcó el pago' })
      continue
    }

    // false: una corrección a mano no se pisa en masa. Quien la hizo la
    // confirma desde su propia fila, viendo los dos números.
    const resultado = await refrescarHorasAsistencia(detalle.ndt_id, false)

    if (!resultado.ok) {
      omitidas.push({ nombre, motivo: resultado.error })
      continue
    }
    if (resultado.sinCambios) {
      yaEstaban += 1
      continue
    }
    recalculadas += 1
  }

  return { ok: true, recalculadas, yaEstaban, omitidas }
}
