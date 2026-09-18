import type { createClient } from '@/lib/supabase/server'
import { DEFAULT_TARDINESS_TYPES, type TardinessType } from '@/modules/attendance/lib/infractions'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface TipoTardiaRow {
  tta_id: number
  tta_nombre: string
  tta_desde_minutos: number
  tta_cuenta_advertencia: boolean
  tta_color: string | null
}

export type LoadTardinessTypesResult =
  { ok: true; data: TardinessType[] } | { ok: false; error: string }

/**
 * Catalogo de tipos de tardia de la empresa, ordenado por el minuto donde
 * empieza cada uno.
 *
 * Asistencia solo LEE el catalogo; administrarlo es cosa de Configuracion
 * (modules/settings). Por eso este lector vive aca y no se importa de alla:
 * cada modulo de negocio es independiente.
 *
 * Si la consulta FALLA se devuelve el error — no se cae a los tipos por
 * defecto, porque clasificar con reglas que no son las de la empresa y no
 * decirlo es peor que no mostrar el reporte. Si la consulta anda pero la
 * empresa no tiene tipos (no deberia pasar, ver DEFAULT_TARDINESS_TYPES), ahi
 * si se usan los de por defecto.
 */
export async function loadTardinessTypes(
  supabase: SupabaseServerClient,
  empresaId: number
): Promise<LoadTardinessTypesResult> {
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_tardia')
    .select('tta_id, tta_nombre, tta_desde_minutos, tta_cuenta_advertencia, tta_color')
    .eq('tta_empresa_id', empresaId)
    .order('tta_desde_minutos', { ascending: true })
    .returns<TipoTardiaRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los tipos de tardia.' }
  }

  if (!data || data.length === 0) {
    return { ok: true, data: DEFAULT_TARDINESS_TYPES }
  }

  return {
    ok: true,
    data: data.map((t) => ({
      id: t.tta_id,
      nombre: t.tta_nombre,
      desdeMinutos: t.tta_desde_minutos,
      cuentaAdvertencia: t.tta_cuenta_advertencia,
      color: t.tta_color,
    })),
  }
}
