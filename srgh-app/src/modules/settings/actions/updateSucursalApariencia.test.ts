import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSucursalApariencia } from './updateSucursalApariencia'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { getSucursalTema } from '@/lib/empresa/get-sucursal-tema'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requireAnyPermission: vi.fn() }))
vi.mock('@/lib/empresa/get-sucursal-tema', () => ({ getSucursalTema: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequireAnyPermission = vi.mocked(requireAnyPermission)
const mockGetSucursalTema = vi.mocked(getSucursalTema)

describe('updateSucursalApariencia (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAnyPermission.mockResolvedValue({
      app_metadata: { usr_id: 10 },
    } as unknown as Awaited<ReturnType<typeof requireAnyPermission>>)
  })

  it('rechaza un color de acento invalido sin llamar al permiso', async () => {
    const result = await updateSucursalApariencia({ colorAcento: 'no-es-hex', colorSidebar: null })

    expect(result).toEqual({
      ok: false,
      error: 'El color de acento debe ser un hex válido (ej. #0891B2).',
    })
    expect(mockRequireAnyPermission).not.toHaveBeenCalled()
  })

  it('rechaza un color de sidebar invalido sin llamar al permiso', async () => {
    const result = await updateSucursalApariencia({ colorAcento: null, colorSidebar: 'azul' })

    expect(result).toEqual({
      ok: false,
      error: 'El color de la barra debe ser un hex válido (ej. #ECECEF).',
    })
    expect(mockRequireAnyPermission).not.toHaveBeenCalled()
  })

  it('permite ambos en null (restablecer a los defaults)', async () => {
    mockGetSucursalTema.mockResolvedValue({
      sucursalId: 5,
      sucursalNombre: 'Centro',
      colorAcento: '#0891b2',
      colorSidebar: '#ececef',
    })
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_sucursales: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSucursalApariencia({ colorAcento: null, colorSidebar: null })

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('sin sucursal fija y sin elegir una, devuelve error sin tocar la base', async () => {
    mockGetSucursalTema.mockResolvedValue({
      sucursalId: null,
      sucursalNombre: null,
      colorAcento: null,
      colorSidebar: null,
    })

    const result = await updateSucursalApariencia({ colorAcento: '#0891b2', colorSidebar: null })

    expect(result).toEqual({
      ok: false,
      error: 'Elegí una sucursal para editar su apariencia.',
    })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('con EMPRESAS_WRITE y sin sucursal fija, puede editar la sucursal que elige explicitamente', async () => {
    mockRequireAnyPermission.mockResolvedValue({
      app_metadata: { usr_id: 10, permisos: ['EMPRESAS_WRITE'] },
    } as unknown as Awaited<ReturnType<typeof requireAnyPermission>>)
    mockGetSucursalTema.mockResolvedValue({
      sucursalId: null,
      sucursalNombre: null,
      colorAcento: null,
      colorSidebar: null,
    })
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_sucursales: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSucursalApariencia({
      sucursalId: 7,
      colorAcento: '#166534',
      colorSidebar: null,
    })

    expect(result).toEqual({ ok: true })
  })

  it('con EMPRESAS_WRITE Y sucursal fija propia, igual puede editar OTRA sucursal que elige', async () => {
    mockRequireAnyPermission.mockResolvedValue({
      app_metadata: { usr_id: 10, permisos: ['EMPRESAS_WRITE'] },
    } as unknown as Awaited<ReturnType<typeof requireAnyPermission>>)
    mockGetSucursalTema.mockResolvedValue({
      sucursalId: 5,
      sucursalNombre: 'Centro',
      colorAcento: null,
      colorSidebar: null,
    })
    const updateSpy = vi.fn(() => ({
      eq: vi.fn((_col: string, val: number) => {
        expect(val).toBe(7) // la elegida en el panel, no la propia (5)
        return { data: null, error: null }
      }),
    }))
    mockCreateClient.mockResolvedValue({
      from: vi.fn(() => ({ update: updateSpy })),
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const result = await updateSucursalApariencia({
      sucursalId: 7,
      colorAcento: '#166534',
      colorSidebar: null,
    })

    expect(result).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalled()
  })

  it('sin EMPRESAS_WRITE, un usuario CON sucursal fija ignora cualquier sucursalId del cliente', async () => {
    mockGetSucursalTema.mockResolvedValue({
      sucursalId: 5,
      sucursalNombre: 'Centro',
      colorAcento: null,
      colorSidebar: null,
    })
    const updateSpy = vi.fn(() => ({
      eq: vi.fn((_col: string, val: number) => {
        expect(val).toBe(5) // nunca el 999 "ajeno" que manda el input
        return { data: null, error: null }
      }),
    }))
    mockCreateClient.mockResolvedValue({
      from: vi.fn(() => ({ update: updateSpy })),
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const result = await updateSucursalApariencia({
      sucursalId: 999,
      colorAcento: '#0891b2',
      colorSidebar: null,
    })

    expect(result).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalled()
  })

  it('devuelve error generico si supabase falla al actualizar', async () => {
    mockGetSucursalTema.mockResolvedValue({
      sucursalId: 5,
      sucursalNombre: 'Centro',
      colorAcento: null,
      colorSidebar: null,
    })
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_sucursales: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSucursalApariencia({ colorAcento: '#0891b2', colorSidebar: null })

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar la apariencia.' })
  })

  it('guarda ambos colores y revalida la ruta en exito', async () => {
    mockGetSucursalTema.mockResolvedValue({
      sucursalId: 5,
      sucursalNombre: 'Centro',
      colorAcento: null,
      colorSidebar: null,
    })
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_sucursales: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSucursalApariencia({
      colorAcento: '#0891b2',
      colorSidebar: '#ececef',
    })

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
