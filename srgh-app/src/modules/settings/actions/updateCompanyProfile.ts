'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { companyProfileSchema, type CompanyProfileInput } from '@/modules/settings/types'

export type UpdateCompanyProfileResult = { ok: true } | { ok: false; error: string }

const GENERIC_ERROR = 'No se pudieron guardar los datos de la empresa.'

/**
 * Guarda identidad, contacto y dirección de la empresa del JWT en una sola
 * transacción (RPC actualizar_perfil_empresa). Es SECURITY DEFINER porque la
 * RLS de sgrh_direcciones no cubre la dirección de la empresa; la RPC toma
 * la empresa del JWT y vuelve a exigir EMPRESAS_WRITE.
 */
export async function updateCompanyProfile(
  input: CompanyProfileInput
): Promise<UpdateCompanyProfileResult> {
  const parsed = companyProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos inválidos.' }
  }

  await requirePermission(PERMISOS.EMPRESAS_WRITE)

  const { direccion, ...datos } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('actualizar_perfil_empresa', {
    p_datos: datos,
    p_direccion: direccion,
  })

  if (error) {
    // Los RAISE de la RPC ya vienen escritos para la UI.
    if (error.code === '42501' || error.code === '23514' || error.code === '23503') {
      return { ok: false, error: error.message || GENERIC_ERROR }
    }
    console.error('updateCompanyProfile:', error.code, error.message)
    return { ok: false, error: GENERIC_ERROR }
  }

  // El nombre de la empresa se ve en el menú y la barra superior de toda la app.
  revalidatePath('/', 'layout')
  return { ok: true }
}
