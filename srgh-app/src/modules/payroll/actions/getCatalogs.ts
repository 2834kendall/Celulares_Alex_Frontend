'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { CatalogoItem } from '@/modules/payroll/types'
import { formatSucursalLabel } from '@/lib/empresa/marca-label'

export type GetCatalogoResult = { ok: true; data: CatalogoItem[] } | { ok: false; error: string }

/**
 * Sucursales activas de la empresa para el formulario de nuevo periodo.
 * No reutiliza el catálogo de employees porque aquel exige EMPLEADOS_READ;
 * quien procesa nómina puede no tener ese permiso.
 */
export async function getSucursalesNomina(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_sucursales')
    .select('suc_id, suc_nombre, sgrh_marcas_comerciales ( mco_nombre )')
    .eq('suc_activa', true)
    .order('suc_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: 'No se pudo cargar el catálogo de sucursales.' }
  }

  return {
    ok: true,
    // Se ordena por lo que se muestra: así quedan juntas las de cada marca.
    data: data
      .map((s) => ({
        id: s.suc_id,
        nombre: formatSucursalLabel(s.sgrh_marcas_comerciales?.mco_nombre, s.suc_nombre),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }
}
