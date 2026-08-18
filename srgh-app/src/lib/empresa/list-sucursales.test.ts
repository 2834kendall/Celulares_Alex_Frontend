import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listSucursalesConApariencia } from './list-sucursales'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

function mockSucursales(result: { data: unknown; error: unknown }) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({ sgrh_sucursales: result }) as unknown as Awaited<
      ReturnType<typeof createClient>
    >
  )
}

describe('listSucursalesConApariencia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mapea las filas a la forma esperada, con colores null cuando no hay personalizacion', async () => {
    mockSucursales({
      data: [
        {
          suc_id: 1,
          suc_nombre: 'Centro',
          suc_color_acento: '#0891b2',
          suc_color_sidebar: '#eef1f4',
        },
        { suc_id: 2, suc_nombre: 'Infinity', suc_color_acento: null, suc_color_sidebar: null },
      ],
      error: null,
    })

    expect(await listSucursalesConApariencia()).toEqual([
      { id: 1, nombre: 'Centro', colorAcento: '#0891b2', colorSidebar: '#eef1f4' },
      { id: 2, nombre: 'Infinity', colorAcento: null, colorSidebar: null },
    ])
  })

  it('devuelve una lista vacia si la consulta falla', async () => {
    mockSucursales({ data: null, error: { message: 'boom' } })

    expect(await listSucursalesConApariencia()).toEqual([])
  })
})
