import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveShellTheme } from './resolve-shell-theme'
import { getSelectorMarca } from './contexto-activo'
import { getMarcaTema, SIN_MARCA, type MarcaApariencia } from './get-marca-tema'
import { getEmpresaShell, type EmpresaShellRow } from './get-empresa-shell'

// Sin `importOriginal`: el módulo real importa el cliente de Supabase, que
// exige variables de entorno.
vi.mock('./get-marca-tema', () => ({
  getMarcaTema: vi.fn(),
  SIN_MARCA: { sucursalId: null, sucursalNombre: null, marca: null },
}))
vi.mock('./contexto-activo', () => ({ getSelectorMarca: vi.fn() }))
vi.mock('./get-empresa-shell', () => ({ getEmpresaShell: vi.fn() }))

const ALEX: MarcaApariencia = {
  id: 1,
  nombre: 'Celulares Alex',
  colorAcento: '#9f1239',
  colorSidebar: null,
  logoPath: '1/marcas/1/a.png',
}
const INFINITY: MarcaApariencia = {
  id: 2,
  nombre: 'Infinity',
  colorAcento: '#1e40af',
  colorSidebar: '#1b2a41',
  logoPath: null,
}

function empresa(colores: Partial<EmpresaShellRow> = {}) {
  vi.mocked(getEmpresaShell).mockResolvedValue({
    org_nombre_fantasia: null,
    org_nombre_social: 'Empresa',
    org_formato_hora: '24h',
    org_logo_url: null,
    org_color_acento: '#166534',
    org_color_sidebar: '#eef1f4',
    ...colores,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMarcaTema).mockResolvedValue(SIN_MARCA)
  vi.mocked(getSelectorMarca).mockResolvedValue({ marcas: [], marcaElegida: null })
  empresa()
})

const MALL = { sucursalId: 10, sucursalNombre: 'Mall', marca: ALEX }

describe('resolveShellTheme', () => {
  it('sin marca, pinta el tema de la empresa', async () => {
    const theme = await resolveShellTheme(1, null)
    expect(theme).toMatchObject({
      marcaNombre: null,
      colorAcento: '#166534',
      colorSidebar: '#eef1f4',
      logoPath: null,
      marcaContextoId: null,
    })
  })

  it('sin selector, pinta su marca y hereda de la empresa el color que no personalizó', async () => {
    vi.mocked(getMarcaTema).mockResolvedValue(MALL)
    const theme = await resolveShellTheme(1, 5)
    expect(theme).toMatchObject({
      marcaNombre: 'Celulares Alex',
      sucursalNombre: 'Mall',
      colorAcento: '#9f1239',
      colorSidebar: '#eef1f4',
      logoPath: '1/marcas/1/a.png',
      marcas: [],
    })
  })

  it('sin tema de empresa, cae a los colores del sistema (null)', async () => {
    empresa({ org_color_acento: null, org_color_sidebar: null })
    const theme = await resolveShellTheme(1, null)
    expect(theme.colorAcento).toBeNull()
    expect(theme.colorSidebar).toBeNull()
  })

  it('la marca elegida gana sobre la propia y no muestra la sucursal propia', async () => {
    vi.mocked(getMarcaTema).mockResolvedValue(MALL)
    vi.mocked(getSelectorMarca).mockResolvedValue({
      marcas: [ALEX, INFINITY],
      marcaElegida: INFINITY,
    })
    const theme = await resolveShellTheme(1, 5)
    expect(theme).toMatchObject({
      marcaNombre: 'Infinity',
      sucursalNombre: null,
      colorAcento: '#1e40af',
      marcaContextoId: 2,
      marcas: [ALEX, INFINITY],
    })
  })

  it('con selector en "Todas" pinta la empresa, aunque tenga marca propia', async () => {
    // Ve datos de varias marcas: pintar la de su primera tienda parecería un filtro.
    vi.mocked(getMarcaTema).mockResolvedValue(MALL)
    vi.mocked(getSelectorMarca).mockResolvedValue({
      marcas: [ALEX, INFINITY],
      marcaElegida: null,
    })
    const theme = await resolveShellTheme(1, 5)
    expect(theme).toMatchObject({
      marcaNombre: null,
      sucursalNombre: null,
      colorAcento: '#166534',
      logoPath: null,
      marcaContextoId: null,
    })
  })

  it('pasa usr_id y emp_id a la resolución de la marca propia', async () => {
    await resolveShellTheme(7, 5)
    expect(getMarcaTema).toHaveBeenCalledWith(7, 5)
  })
})
