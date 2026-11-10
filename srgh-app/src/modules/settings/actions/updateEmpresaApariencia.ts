'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { aparienciaSchema, type AparienciaInput, type AparienciaResult } from '../lib/apariencia'

/**
 * Guarda el tema por defecto de la empresa del JWT: el que se ve cuando no
 * hay marca en contexto (un ADMIN sin sucursal) y el que heredan las marcas
 * que no personalizaron algún color.
 *
 * La fila no se elige por parámetro: la RLS `empresas_update` solo deja
 * tocar la de la empresa del JWT y exige EMPRESAS_WRITE.
 */
export async function updateEmpresaApariencia(input: AparienciaInput): Promise<AparienciaResult> {
  const parsed = aparienciaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const claims = await requirePermission(PERMISOS.EMPRESAS_WRITE)
  const empresaId = z
    .number()
    .int()
    .positive()
    .safeParse((claims.app_metadata as { empresa_id?: unknown })?.empresa_id)
  if (!empresaId.success) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .update({
      org_color_acento: parsed.data.colorAcento,
      org_color_sidebar: parsed.data.colorSidebar,
    })
    .eq('org_id', empresaId.data)
    .select('org_id')

  // Una escritura que la RLS filtra no da error: afecta 0 filas.
  if (error || !data?.length) {
    return { ok: false, error: 'No se pudo guardar la apariencia.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
