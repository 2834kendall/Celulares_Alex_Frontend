import { getSucursalTema } from '@/lib/empresa/get-sucursal-tema'
import {
  listSucursalesConApariencia,
  type SucursalConApariencia,
} from '@/lib/empresa/list-sucursales'
import { getSucursalPreviewId } from '@/lib/empresa/sucursal-preview'
import { PERMISOS } from '@/lib/permissions/catalog'

export interface ShellTheme {
  sucursalNombre: string | null
  colorAcento: string | null
  colorSidebar: string | null
  /** Sucursales de la empresa con permiso EMPRESAS_WRITE; vacio para el resto. */
  sucursales: SucursalConApariencia[]
  /** Sucursal actualmente en preview (ver sucursal-preview.ts), o null. */
  sucursalPreviewId: number | null
}

/**
 * Tema OFICIAL que pinta el shell ahora mismo: la sucursal fija del usuario,
 * salvo que haya una sucursal en preview (selector de la barra superior), que
 * gana. Fuente unica — la usan `(dashboard)/layout.tsx` (para pintar
 * AppShell) y `settings/page.tsx` (para poder RESTAURAR estos mismos colores
 * cuando se sale del formulario de apariencia de una sucursal).
 *
 * Antes cada uno calculaba esto por su lado: `(dashboard)/layout.tsx` si
 * consideraba la cookie de preview, `settings/page.tsx` no. Eso es lo que
 * dejaba la previsualizacion en vivo del formulario de apariencia "pegada"
 * al salir — no habia forma de saber a que colores volver porque
 * `settings/page.tsx` nunca supo que colores estaba pintando el shell
 * realmente.
 */
export async function resolveShellTheme(
  usrId: number | null | undefined,
  permisos: string[]
): Promise<ShellTheme> {
  const administraEmpresa = permisos.includes(PERMISOS.EMPRESAS_WRITE)

  const [tema, sucursales, previewId] = await Promise.all([
    getSucursalTema(usrId),
    administraEmpresa ? listSucursalesConApariencia() : Promise.resolve([]),
    administraEmpresa ? getSucursalPreviewId() : Promise.resolve(null),
  ])

  const previewSucursal = previewId ? (sucursales.find((s) => s.id === previewId) ?? null) : null

  return {
    sucursalNombre: previewSucursal?.nombre ?? tema.sucursalNombre,
    colorAcento: previewSucursal?.colorAcento ?? tema.colorAcento,
    colorSidebar: previewSucursal?.colorSidebar ?? tema.colorSidebar,
    sucursales,
    sucursalPreviewId: previewSucursal?.id ?? null,
  }
}
