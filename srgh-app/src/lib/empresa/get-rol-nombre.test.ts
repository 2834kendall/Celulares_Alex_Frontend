import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRolNombre } from './get-rol-nombre'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

function mockRoles(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({ sgrh_cat_roles: result })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('getRolNombre', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve el nombre del rol cuyo código trae el JWT', async () => {
    const client = mockRoles({ data: { rol_nombre: 'Gerente de Sucursal' }, error: null })

    expect(await getRolNombre('EMPRESA_1_GERENTE')).toBe('Gerente de Sucursal')
    expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith(
      'rol_codigo',
      'EMPRESA_1_GERENTE'
    )
  })

  it('sin código no consulta', async () => {
    expect(await getRolNombre(null)).toBeNull()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('nunca muestra el código: null si la consulta falla o la RLS no devuelve fila', async () => {
    mockRoles({ data: null, error: { message: 'boom' } })
    expect(await getRolNombre('EMPRESA_1_40')).toBeNull()

    mockRoles({ data: null, error: null })
    expect(await getRolNombre('EMPRESA_1_40')).toBeNull()
  })
})
