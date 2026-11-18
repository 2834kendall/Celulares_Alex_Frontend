'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { esCuentaDeEmpresa } from '@/modules/payroll/lib/alcancePlanilla'
import { sincronizarEstadoPeriodo } from '@/modules/payroll/lib/estadoPeriodoData'

export type RecalcularEstadoPeriodosResult =
  | {
      ok: true
      /** Periodos revisados. */
      revisados: number
      /** De esos, cuántos cambiaron de estado (borrador ↔ pagado). */
      cambiaron: number
    }
  | { ok: false; error: string }

interface PeriodoEstadoRow {
  npe_id: number
  npe_estado: string
}

/**
 * Vuelve a calcular el estado ('borrador' / 'pagado') de todos los periodos
 * de la empresa a partir de sus filas, con la misma regla de siempre
 * (sincronizarEstadoPeriodo).
 *
 * Es mantenimiento: hace falta una vez después de fusionar los periodos por
 * sucursal en periodos por empresa (la migración deja el estado con una regla
 * más simple, sin mirar las liquidaciones), y sirve si algún periodo quedó
 * con un estado que no corresponde a sus pagos.
 *
 * Solo para una cuenta de toda la empresa: el estado se calcula con todas las
 * filas, y quien lo dispara tiene que poder ver el resultado completo.
 */
export async function recalcularEstadoPeriodos(): Promise<RecalcularEstadoPeriodosResult> {
  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  if (!esCuentaDeEmpresa(claims)) {
    return {
      ok: false,
      error:
        'Solo una cuenta de toda la empresa (sin sucursal asignada) puede recalcular el estado de los periodos.',
    }
  }

  const supabase = await createClient()
  const leer = () =>
    supabase
      .from('sgrh_nomina_periodo')
      .select('npe_id, npe_estado')
      .order('npe_id', { ascending: true })
      .returns<PeriodoEstadoRow[]>()

  const { data: antes, error } = await leer()
  if (error || !Array.isArray(antes)) {
    return { ok: false, error: 'No se pudieron cargar los periodos de nómina.' }
  }

  // Uno por uno: cada recálculo lee las filas y las liquidaciones de su
  // periodo, y no hay apuro que justifique lanzar todos a la vez.
  for (const periodo of antes) {
    await sincronizarEstadoPeriodo(supabase, periodo.npe_id)
  }

  const { data: despues, error: errDespues } = await leer()
  if (errDespues || !Array.isArray(despues)) {
    return {
      ok: false,
      error: 'Los periodos se recalcularon, pero no se pudo leer el resultado. Recargá la página.',
    }
  }

  const estadoAntes = new Map(antes.map((p) => [p.npe_id, p.npe_estado]))
  const cambiaron = despues.filter((p) => estadoAntes.get(p.npe_id) !== p.npe_estado).length

  revalidatePath('/payroll')
  return { ok: true, revisados: antes.length, cambiaron }
}
