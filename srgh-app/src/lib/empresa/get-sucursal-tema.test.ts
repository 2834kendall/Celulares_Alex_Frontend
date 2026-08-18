import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSucursalTema } from './get-sucursal-tema'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

function mockAsignacion(result: { data: unknown; error: unknown }) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({ sgrh_usuarios_empresa_rol: result }) as unknown as Awaited<
      ReturnType<typeof createClient>
    >
  )
}

const SIN_TEMA = {
  sucursalId: null,
  sucursalNombre: null,
  colorAcento: null,
  colorSidebar: null,
}

describe('getSucursalTema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve el tema vacio sin consultar si no hay usr_id', async () => {
    expect(await getSucursalTema(null)).toEqual(SIN_TEMA)
    expect(await getSucursalTema(undefined)).toEqual(SIN_TEMA)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('devuelve nombre y colores de la sucursal asignada', async () => {
    mockAsignacion({
      data: {
        uer_sucursal_id: 2,
        sgrh_sucursales: {
          suc_id: 2,
          suc_nombre: 'PZ2',
          suc_color_acento: '#0891b2',
          suc_color_sidebar: '#ececef',
        },
      },
      error: null,
    })

    expect(await getSucursalTema(10)).toEqual({
      sucursalId: 2,
      sucursalNombre: 'PZ2',
      colorAcento: '#0891b2',
      colorSidebar: '#ececef',
    })
  })

  it('devuelve colores null cuando la sucursal no los ha personalizado', async () => {
    mockAsignacion({
      data: {
        uer_sucursal_id: 2,
        sgrh_sucursales: {
          suc_id: 2,
          suc_nombre: 'PZ2',
          suc_color_acento: null,
          suc_color_sidebar: null,
        },
      },
      error: null,
    })

    expect(await getSucursalTema(10)).toEqual({
      sucursalId: 2,
      sucursalNombre: 'PZ2',
      colorAcento: null,
      colorSidebar: null,
    })
  })

  it('devuelve el tema vacio cuando el usuario no tiene sucursal fija (p. ej. ADMIN)', async () => {
    mockAsignacion({
      data: { uer_sucursal_id: null, sgrh_sucursales: null },
      error: null,
    })

    expect(await getSucursalTema(10)).toEqual(SIN_TEMA)
  })

  it('devuelve el tema vacio si la consulta falla', async () => {
    mockAsignacion({ data: null, error: { message: 'boom' } })

    expect(await getSucursalTema(10)).toEqual(SIN_TEMA)
  })

  it('devuelve el tema vacio si no hay asignacion activa', async () => {
    mockAsignacion({ data: null, error: null })

    expect(await getSucursalTema(10)).toEqual(SIN_TEMA)
  })
})
