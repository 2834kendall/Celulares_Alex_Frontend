import { FORMATO_HORA_DEFAULT, parseFormatoHora, type FormatoHora } from '@/lib/time/formatoHora'
import { getEmpresaShell } from './get-empresa-shell'

/**
 * Formato de hora que eligió la empresa del usuario (Configuración →
 * General). Solo presentación: ver lib/time/formatoHora.ts.
 *
 * La fila sale de getEmpresaShell, igual que getEmpresaNombre: la RLS
 * `empresas_select` expone solo la fila de la empresa del JWT y NO exige
 * permiso, así que sirve igual para el shell administrativo y para la cuenta
 * del kiosco. Ante cualquier fallo devuelve el default ('24h') en vez de romper.
 */
export async function getFormatoHora(): Promise<FormatoHora> {
  const empresa = await getEmpresaShell()

  if (!empresa) {
    return FORMATO_HORA_DEFAULT
  }

  return parseFormatoHora(empresa.org_formato_hora)
}
