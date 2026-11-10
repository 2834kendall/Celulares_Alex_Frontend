import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'
import { getEmpresaShell } from './get-empresa-shell'

/**
 * URL firmada del logo que pinta el shell, o null si no hay logo o no se pudo
 * firmar: el menú cae a la inicial del nombre.
 *
 * Con `marcaLogoPath` (el logo de la marca en contexto) se firma ese; si es
 * null, el de la empresa del JWT (ruta en getEmpresaShell, que el layout ya
 * lee: acá solo se suma la firma). Los dos viven en el bucket logos-empresa,
 * bajo la carpeta de la empresa. Se re-firma en cada carga (TTL_FOTO, 1 h),
 * igual que las fotos.
 */
export async function getEmpresaLogoUrl(
  marcaLogoPath: string | null = null
): Promise<string | null> {
  const path = marcaLogoPath ?? (await getEmpresaShell())?.org_logo_url
  if (!path) return null

  const signed = await getStorageProvider().getSignedUrl('LOGO_EMPRESA', path, TTL_FOTO)
  return signed.ok ? signed.data : null
}
