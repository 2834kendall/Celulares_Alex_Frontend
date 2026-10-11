'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { filaSinNadaQuePagar } from '@/modules/payroll/lib/filaSinNadaQuePagar'
import { sincronizarEstadoPeriodo } from '@/modules/payroll/lib/estadoPeriodoData'

export type QuitarFilaPlanillaResult = { ok: true } | { ok: false; error: string }

interface FilaRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  ndt_pagado: boolean
  ndt_salario_bruto: number
  ndt_salario_neto: number
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_dias_incapacidad_empleador: number
  sgrh_nomina_periodo: { npe_estado: string } | null
}

/**
 * Quita del periodo una fila que no tiene nada que pagar (ver
 * filaSinNadaQuePagar): alguien cargado sin horario ni marcas. Sin esto, un
 * periodo vencido con una de esas filas no se podía cerrar nunca (auditoría
 * 2, fallo 5). Al quitarla, el periodo pasa a pagado si todos los demás ya lo
 * están.
 *
 * El borrado usa eliminar_filas_planilla, la misma función transaccional de
 * la subida del Excel.
 */
export async function quitarFilaPlanilla(ndtId: number): Promise<QuitarFilaPlanillaResult> {
  if (!Number.isInteger(ndtId) || ndtId <= 0) {
    return { ok: false, error: 'Fila inválida.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: fila, error } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      'ndt_id, ndt_nomina_periodo_id, ndt_pagado, ndt_salario_bruto, ndt_salario_neto, ndt_horas_ordinarias_diurnas, ndt_horas_extra_al_50, ndt_dias_incapacidad_empleador, sgrh_nomina_periodo ( npe_estado )'
    )
    .eq('ndt_id', ndtId)
    .maybeSingle<FilaRow>()

  if (error) return { ok: false, error: 'No se pudo cargar la fila.' }
  if (!fila) return { ok: false, error: 'La fila no existe o no es visible.' }
  if (fila.sgrh_nomina_periodo?.npe_estado !== 'borrador') {
    return { ok: false, error: 'Solo se pueden quitar filas de un periodo en borrador.' }
  }
  if (!filaSinNadaQuePagar(fila)) {
    return {
      ok: false,
      error:
        'Solo se puede quitar una fila sin nada que pagar (₡0, sin horas y sin incapacidad). Si tiene horas o monto, corregila o pagala.',
    }
  }

  const { error: errBorrado } = await supabase.rpc('eliminar_filas_planilla', {
    p_ndt_ids: [ndtId],
  })
  if (errBorrado) {
    if (['23514', '42501'].includes(errBorrado.code ?? '')) {
      return { ok: false, error: errBorrado.message }
    }
    console.error('quitarFilaPlanilla: no se pudo quitar la fila', errBorrado)
    return { ok: false, error: 'No se pudo quitar la fila.' }
  }

  await sincronizarEstadoPeriodo(supabase, fila.ndt_nomina_periodo_id)

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${fila.ndt_nomina_periodo_id}`)
  return { ok: true }
}
