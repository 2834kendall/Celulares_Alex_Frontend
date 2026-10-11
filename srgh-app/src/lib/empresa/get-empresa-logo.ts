import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'
import { getEmpresaShell } from './get-empresa-shell'

/**
 * URL firmada del logo de la empresa del JWT para el menú (SGRH-92), o null
 * si no tiene logo o no se pudo firmar: el menú cae a la inicial del nombre.
 *
 * La ruta sale de getEmpresaShell, que el layout ya lee: solo suma la firma.
 * Se re-firma en cada carga (TTL_FOTO, 1 h), igual que las fotos.
 */
export async function getEmpresaLogoUrl(): Promise<string | null> {
  const empresa = await getEmpresaShell()
  if (!empresa?.org_logo_url) return null

  const signed = await getStorageProvider().getSignedUrl(
    'LOGO_EMPRESA',
    empresa.org_logo_url,
    TTL_FOTO
  )
  return signed.ok ? signed.data : null
}
