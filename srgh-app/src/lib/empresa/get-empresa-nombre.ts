import { BRAND } from '@/lib/brand'
import { getEmpresaShell } from './get-empresa-shell'

/**
 * Nombre real de la empresa del usuario autenticado.
 *
 * La fila sale de getEmpresaShell (una consulta por request, compartida con
 * getFormatoHora). Ante cualquier fallo se degrada al nombre de marca por
 * defecto para no romper el shell de la aplicación.
 */
export async function getEmpresaNombre(): Promise<string> {
  const empresa = await getEmpresaShell()

  if (!empresa) {
    return BRAND.empresa
  }

  return empresa.org_nombre_fantasia?.trim() || empresa.org_nombre_social
}
