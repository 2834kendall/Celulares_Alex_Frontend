'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'
import type { CompanyProfile } from '@/modules/settings/types'

export type GetCompanyProfileResult =
  { ok: true; data: CompanyProfile } | { ok: false; error: string }

interface EmpresaRow {
  org_cedula_juridica: string
  org_nombre_social: string
  org_nombre_fantasia: string | null
  org_email_corporativo: string | null
  org_telefono: string | null
  org_representante_legal: string | null
  org_actividad_economica_ciiu: string | null
  org_logo_url: string | null
  sgrh_direcciones: { dir_distrito_id: number; dir_senas_exactas: string | null } | null
}

/**
 * Perfil de la empresa del JWT para Configuración → Datos de la empresa.
 * Exige EMPRESAS_WRITE (es la pantalla para editarlo). No filtra por
 * empresa: la RLS (empresas_select) solo expone la fila del JWT, y
 * direcciones_select deja leer la dirección que la empresa referencia.
 */
export async function getCompanyProfile(): Promise<GetCompanyProfileResult> {
  await requirePermission(PERMISOS.EMPRESAS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .select(
      `
      org_cedula_juridica, org_nombre_social, org_nombre_fantasia, org_email_corporativo,
      org_telefono, org_representante_legal, org_actividad_economica_ciiu, org_logo_url,
      sgrh_direcciones ( dir_distrito_id, dir_senas_exactas )
    `
    )
    .maybeSingle<EmpresaRow>()

  if (error || !data) {
    return { ok: false, error: 'No se pudieron cargar los datos de la empresa.' }
  }

  // org_logo_url guarda la RUTA en el bucket privado; la URL se firma en cada
  // carga. Si el firmado falla, la página igual se muestra, sin logo.
  let logoUrl: string | null = null
  if (data.org_logo_url) {
    const signed = await getStorageProvider().getSignedUrl(
      'LOGO_EMPRESA',
      data.org_logo_url,
      TTL_FOTO
    )
    logoUrl = signed.ok ? signed.data : null
  }

  // Campo por campo a propósito: la ruta del logo (org_logo_url) nunca sale
  // hacia el cliente, solo la URL firmada.
  const direccion = data.sgrh_direcciones

  return {
    ok: true,
    data: {
      org_cedula_juridica: data.org_cedula_juridica,
      org_nombre_social: data.org_nombre_social,
      org_nombre_fantasia: data.org_nombre_fantasia,
      org_email_corporativo: data.org_email_corporativo,
      org_telefono: data.org_telefono,
      org_representante_legal: data.org_representante_legal,
      org_actividad_economica_ciiu: data.org_actividad_economica_ciiu,
      direccion: direccion
        ? {
            dir_distrito_id: direccion.dir_distrito_id,
            dir_senas_exactas: direccion.dir_senas_exactas ?? '',
          }
        : null,
      logoUrl,
    },
  }
}
