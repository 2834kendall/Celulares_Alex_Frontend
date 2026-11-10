import { getEmpresaShell } from '@/lib/empresa/get-empresa-shell'
import { getMarcaTema, type MarcaApariencia } from '@/lib/empresa/get-marca-tema'
import { listMarcasConApariencia } from '@/lib/empresa/list-marcas'
import { getMarcaPreviewId } from '@/lib/empresa/marca-preview'
import { PERMISOS } from '@/lib/permissions/catalog'

export interface ShellTheme {
  /** Marca que pinta el shell (la propia o la del preview), o null = vista de empresa. */
  marcaNombre: string | null
  /** Sucursal propia del usuario; null en preview o si opera a nivel empresa. */
  sucursalNombre: string | null
  colorAcento: string | null
  colorSidebar: string | null
  /** RUTA del logo de la marca, o null para usar el de la empresa. */
  logoPath: string | null
  /** Marcas activas de la empresa con permiso EMPRESAS_WRITE; vacío para el resto. */
  marcas: MarcaApariencia[]
  /** Marca actualmente en preview (ver marca-preview.ts), o null. */
  marcaPreviewId: number | null
}

/**
 * Tema OFICIAL que pinta el shell ahora mismo. Orden:
 *
 *   marca en preview (selector de la barra superior, solo EMPRESAS_WRITE)
 *   → marca propia (sucursal de la cuenta, o la del contrato vigente)
 *   → tema de la empresa
 *   → colores del sistema (null)
 *
 * Cada color cae por separado: una marca que solo personalizó el acento
 * hereda la barra lateral de la empresa.
 *
 * Fuente única: la usa `(dashboard)/layout.tsx` para pintar AppShell.
 */
export async function resolveShellTheme(
  usrId: number | null | undefined,
  empId: number | null | undefined,
  permisos: string[]
): Promise<ShellTheme> {
  const administraEmpresa = permisos.includes(PERMISOS.EMPRESAS_WRITE)

  const [tema, marcas, previewId, empresa] = await Promise.all([
    getMarcaTema(usrId, empId),
    administraEmpresa ? listMarcasConApariencia() : Promise.resolve([]),
    administraEmpresa ? getMarcaPreviewId() : Promise.resolve(null),
    getEmpresaShell(),
  ])

  const preview = previewId ? (marcas.find((m) => m.id === previewId) ?? null) : null
  const marca = preview ?? tema.marca

  return {
    marcaNombre: marca?.nombre ?? null,
    sucursalNombre: preview ? null : tema.sucursalNombre,
    colorAcento: marca?.colorAcento ?? empresa?.org_color_acento ?? null,
    colorSidebar: marca?.colorSidebar ?? empresa?.org_color_sidebar ?? null,
    logoPath: marca?.logoPath ?? null,
    marcas,
    marcaPreviewId: preview?.id ?? null,
  }
}
