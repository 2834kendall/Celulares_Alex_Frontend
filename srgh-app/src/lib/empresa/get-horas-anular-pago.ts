import { createClient } from '@/lib/supabase/server'
import { HORAS_ANULAR_PAGO_DEFAULT } from '@/modules/payroll/lib/anulacionPagosReglas'

/**
 * Horas que tiene la empresa para anular un pago de aguinaldo o liquidación
 * hecho por error (Configuración → General). La RLS `empresas_select` solo
 * expone la fila de la empresa del JWT. Ante cualquier fallo devuelve el
 * default (48): es solo lo que muestra el formulario; el plazo que vale lo
 * revisa la base al anular.
 */
export async function getHorasAnularPago(): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .select('org_horas_anular_pago')
    .maybeSingle<{ org_horas_anular_pago: number | null }>()
  const horas = Number(data?.org_horas_anular_pago)
  return error || !Number.isInteger(horas) || horas < 1 ? HORAS_ANULAR_PAGO_DEFAULT : horas
}
