'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { CandidatoListItem } from '@/modules/recruitment/types'

export type SearchCandidatesResult =
  { ok: true; data: CandidatoListItem[] } | { ok: false; error: string }

const MAX_RESULTS = 20

/**
 * Búsqueda de candidatos ya registrados, para el flujo "postular de nuevo"
 * (evita crear un duplicado cuando la persona ya existe). RLS ya limita las
 * filas a la empresa del usuario.
 */
export async function searchCandidates(query: string): Promise<SearchCandidatesResult> {
  await requirePermission(PERMISOS.RECLUTAMIENTO_READ)

  // PostgREST lee `,()` como separadores de su propio DSL de filtros (no hay
  // riesgo de inyección SQL — RLS sigue aplicando — pero sin esto una coma
  // en el término rompe el filtro .or() con un 400). Se limpian antes de
  // armar la cadena.
  const term = query.trim().replace(/[,()]/g, ' ').trim()
  if (term.length < 2) {
    return { ok: true, data: [] }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_candidatos')
    .select(
      'cdt_id, cdt_nombre, cdt_apellido_1, cdt_apellido_2, cdt_email, cdt_telefono, cdt_numero_identificacion'
    )
    .or(
      `cdt_nombre.ilike.%${term}%,cdt_apellido_1.ilike.%${term}%,cdt_numero_identificacion.ilike.%${term}%,cdt_email.ilike.%${term}%`
    )
    .order('cdt_apellido_1', { ascending: true })
    .limit(MAX_RESULTS)

  if (error) {
    return { ok: false, error: 'No se pudo buscar candidatos.' }
  }

  return { ok: true, data: data ?? [] }
}
