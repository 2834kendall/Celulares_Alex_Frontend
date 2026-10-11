'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { FormatoHora } from '@/lib/time/formatoHora'
import type { SgrhJwtClaims } from '@/types/auth'

const formatoHoraSchema = z.enum(['12h', '24h'])

export type UpdateFormatoHoraResult = { ok: true } | { ok: false; error: string }

/**
 * Cambia el formato de hora (12h/24h) de TODA la empresa.
 *
 * Es solo presentación: la base, los esquemas y la lógica de asistencia
 * siguen trabajando en "HH:MM" 24h (ver lib/time/formatoHora.ts), así que
 * cambiarlo no toca ningún dato ni cálculo — nada que migrar.
 *
 * EMPRESAS_WRITE porque afecta a todas las sucursales, igual que la RLS
 * `empresas_update`, que además limita la fila a la empresa del JWT: el
 * `org_id` sale de los claims, nunca del cliente.
 */
export async function updateFormatoHora(formato: FormatoHora): Promise<UpdateFormatoHoraResult> {
  const parsed = formatoHoraSchema.safeParse(formato)
  if (!parsed.success) {
    return { ok: false, error: 'Formato de hora inválido.' }
  }

  const claims = await requirePermission(PERMISOS.EMPRESAS_WRITE)
  const meta = (claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  if (!meta.empresa_id) {
    return { ok: false, error: 'No se encontró la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .update({ org_formato_hora: parsed.data })
    .eq('org_id', meta.empresa_id)
    .select('org_id')

  // Sin filas = la RLS filtró el UPDATE en silencio (PostgREST no lo
  // reporta como error). Se avisa en vez de fingir que se guardó.
  if (error || !data || data.length === 0) {
    return { ok: false, error: 'No se pudo guardar el formato de hora.' }
  }

  // Layout entero: el formato lo lee el shell del dashboard y el kiosco.
  revalidatePath('/', 'layout')
  return { ok: true }
}
