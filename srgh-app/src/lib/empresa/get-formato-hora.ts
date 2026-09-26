import { createClient } from '@/lib/supabase/server'
import { FORMATO_HORA_DEFAULT, parseFormatoHora, type FormatoHora } from '@/lib/time/formatoHora'

/**
 * Formato de hora que eligió la empresa del usuario (Configuración →
 * General). Solo presentación: ver lib/time/formatoHora.ts.
 *
 * Mismo criterio que getEmpresaNombre: la RLS `empresas_select` expone solo
 * la fila de la empresa del JWT y NO exige permiso, así que sirve igual
 * para el shell administrativo y para la cuenta del kiosco.
 *
 * Ante cualquier fallo devuelve el default ('24h') en vez de romper. Eso
 * incluye el caso de que la columna todavía no exista porque la migración
 * no se aplicó: el código puede salir antes que la migración sin que nada
 * cambie de aspecto.
 */
export async function getFormatoHora(): Promise<FormatoHora> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .select('org_formato_hora')
    .maybeSingle()

  if (error || !data) {
    return FORMATO_HORA_DEFAULT
  }

  return parseFormatoHora(data.org_formato_hora)
}
