import { createClient } from '@/lib/supabase/server'
import { toMarcaApariencia, type MarcaApariencia, type MarcaRow } from './get-marca-tema'

/**
 * Marcas ACTIVAS de la empresa del usuario, con su apariencia, para el
 * selector de vista de la barra superior. RLS (`marcas_comerciales_select`)
 * ya limita el resultado a `mco_empresa_id = get_empresa_id()`.
 */
export async function listMarcasConApariencia(): Promise<MarcaApariencia[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_marcas_comerciales')
    .select('mco_id, mco_nombre, mco_color_acento, mco_color_sidebar, mco_logo_path')
    .eq('mco_activa', true)
    .order('mco_nombre', { ascending: true })
    .returns<MarcaRow[]>()

  if (error || !data) return []
  return data.map(toMarcaApariencia)
}
