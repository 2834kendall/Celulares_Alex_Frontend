import { getSelectorMarca } from '@/lib/empresa/contexto-activo'
import { getEmpresaShell } from '@/lib/empresa/get-empresa-shell'
import { getMarcaTema, type MarcaApariencia } from '@/lib/empresa/get-marca-tema'

export interface ShellTheme {
  /** Marca que pinta el shell (la elegida o la propia), o null = vista de empresa. */
  marcaNombre: string | null
  /** Sucursal propia del usuario; null si tiene selector o si opera a nivel empresa. */
  sucursalNombre: string | null
  colorAcento: string | null
  colorSidebar: string | null
  /** RUTA del logo de la marca, o null para usar el de la empresa. */
  logoPath: string | null
  /** Marcas que la cuenta puede elegir; vacío si no tiene selector. */
  marcas: MarcaApariencia[]
  /** Marca elegida en el selector (ver contexto-activo.ts), o null = todas. */
  marcaContextoId: number | null
}

/**
 * Tema OFICIAL que pinta el shell ahora mismo. Orden:
 *
 *   marca elegida en el selector
 *   → si tiene selector y está en "Todas": tema de la empresa
 *   → marca propia (sucursal de la cuenta, o la del contrato vigente)
 *   → tema de la empresa
 *   → colores del sistema (null)
 *
 * Quien tiene selector y está en "Todas" ve datos de varias marcas: pintar la de
 * su primera tienda se leería como un filtro que no existe.
 *
 * Cada color cae por separado: una marca que solo personalizó el acento
 * hereda la barra lateral de la empresa.
 *
 * Fuente única: la usa `(dashboard)/layout.tsx` para pintar AppShell.
 */
export async function resolveShellTheme(
  usrId: number | null | undefined,
  empId: number | null | undefined
): Promise<ShellTheme> {
  const [tema, selector, empresa] = await Promise.all([
    getMarcaTema(usrId, empId),
    getSelectorMarca(),
    getEmpresaShell(),
  ])

  const tieneSelector = selector.marcas.length > 0
  const marca = selector.marcaElegida ?? (tieneSelector ? null : tema.marca)

  return {
    marcaNombre: marca?.nombre ?? null,
    sucursalNombre: tieneSelector ? null : tema.sucursalNombre,
    colorAcento: marca?.colorAcento ?? empresa?.org_color_acento ?? null,
    colorSidebar: marca?.colorSidebar ?? empresa?.org_color_sidebar ?? null,
    logoPath: marca?.logoPath ?? null,
    marcas: selector.marcas,
    marcaContextoId: selector.marcaElegida?.id ?? null,
  }
}
