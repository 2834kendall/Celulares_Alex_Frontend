import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveShellTheme } from './resolve-shell-theme'
import { getMarcaTema, SIN_MARCA, type MarcaApariencia } from './get-marca-tema'
import { listMarcasConApariencia } from './list-marcas'
import { getMarcaPreviewId } from './marca-preview'
import { getEmpresaShell, type EmpresaShellRow } from './get-empresa-shell'

// Sin `importOriginal`: el módulo real importa el cliente de Supabase, que
// exige variables de entorno.
vi.mock('./get-marca-tema', () => ({
  getMarcaTema: vi.fn(),
  SIN_MARCA: { sucursalId: null, sucursalNombre: null, marca: null },
}))
vi.mock('./list-marcas', () => ({ listMarcasConApariencia: vi.fn() }))
vi.mock('./marca-preview', () => ({ getMarcaPreviewId: vi.fn() }))
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
  vi.mocked(listMarcasConApariencia).mockResolvedValue([ALEX, INFINITY])
  vi.mocked(getMarcaPreviewId).mockResolvedValue(null)
  empresa()
})

describe('resolveShellTheme', () => {
  it('sin marca (ADMIN), pinta el tema de la empresa', async () => {
    const theme = await resolveShellTheme(1, null, ['EMPRESAS_WRITE'])
    expect(theme).toMatchObject({
      marcaNombre: null,
      colorAcento: '#166534',
      colorSidebar: '#eef1f4',
      logoPath: null,
      marcaPreviewId: null,
    })
    expect(theme.marcas).toEqual([ALEX, INFINITY])
  })

  it('con marca propia, pinta la marca y hereda de la empresa el color que no personalizó', async () => {
    vi.mocked(getMarcaTema).mockResolvedValue({
      sucursalId: 10,
      sucursalNombre: 'Mall',
      marca: ALEX,
    })
    const theme = await resolveShellTheme(1, 5, [])
    expect(theme).toMatchObject({
      marcaNombre: 'Celulares Alex',
      sucursalNombre: 'Mall',
      colorAcento: '#9f1239',
      colorSidebar: '#eef1f4',
      logoPath: '1/marcas/1/a.png',
    })
  })

  it('sin tema de empresa, cae a los colores del sistema (null)', async () => {
    empresa({ org_color_acento: null, org_color_sidebar: null })
    const theme = await resolveShellTheme(1, null, [])
    expect(theme.colorAcento).toBeNull()
    expect(theme.colorSidebar).toBeNull()
  })

  it('la marca en preview gana sobre la propia y no muestra la sucursal propia', async () => {
    vi.mocked(getMarcaTema).mockResolvedValue({
      sucursalId: 10,
      sucursalNombre: 'Mall',
      marca: ALEX,
    })
    vi.mocked(getMarcaPreviewId).mockResolvedValue(2)
    const theme = await resolveShellTheme(1, 5, ['EMPRESAS_WRITE'])
    expect(theme).toMatchObject({
      marcaNombre: 'Infinity',
      sucursalNombre: null,
      colorAcento: '#1e40af',
      marcaPreviewId: 2,
    })
  })

  it('ignora un preview que no es una marca activa de la lista', async () => {
    vi.mocked(getMarcaPreviewId).mockResolvedValue(99)
    const theme = await resolveShellTheme(1, null, ['EMPRESAS_WRITE'])
    expect(theme.marcaPreviewId).toBeNull()
    expect(theme.marcaNombre).toBeNull()
  })

  it('sin EMPRESAS_WRITE no lista marcas ni lee la cookie de preview', async () => {
    const theme = await resolveShellTheme(1, 5, ['MI_HORARIO_READ'])
    expect(theme.marcas).toEqual([])
    expect(listMarcasConApariencia).not.toHaveBeenCalled()
    expect(getMarcaPreviewId).not.toHaveBeenCalled()
  })

  it('pasa usr_id y emp_id a la resolución de la marca propia', async () => {
    await resolveShellTheme(7, 5, [])
    expect(getMarcaTema).toHaveBeenCalledWith(7, 5)
  })
})
