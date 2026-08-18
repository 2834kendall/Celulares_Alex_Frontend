import { createClient } from '@/lib/supabase/server'

export interface SucursalConApariencia {
  id: number
  nombre: string
  colorAcento: string | null
  colorSidebar: string | null
}

/**
 * Sucursales activas de la empresa del usuario autenticado, con su
 * apariencia actual — para el selector de Configuración que usan
 * ADMIN/RRHH (sin sucursal fija) para elegir a cuál sucursal editarle el
 * color. RLS (`sucursales_select`) ya limita el resultado a
 * `suc_empresa_id = get_empresa_id()`.
 */
export async function listSucursalesConApariencia(): Promise<SucursalConApariencia[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_sucursales')
    .select('suc_id, suc_nombre, suc_color_acento, suc_color_sidebar')
    .eq('suc_activa', true)
    .order('suc_nombre', { ascending: true })

  if (error || !data) return []

  return data.map((s) => ({
    id: s.suc_id,
    nombre: s.suc_nombre,
    colorAcento: s.suc_color_acento,
    colorSidebar: s.suc_color_sidebar,
  }))
}
