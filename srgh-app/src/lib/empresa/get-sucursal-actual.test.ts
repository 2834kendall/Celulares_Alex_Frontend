import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSucursalActual } from './get-sucursal-actual'
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

describe('getSucursalActual', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve null sin consultar si no hay usr_id', async () => {
    expect(await getSucursalActual(null)).toBeNull()
    expect(await getSucursalActual(undefined)).toBeNull()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('devuelve el nombre de la sucursal asignada', async () => {
    mockAsignacion({
      data: { uer_sucursal_id: 2, sgrh_sucursales: { suc_nombre: 'PZ2' } },
      error: null,
    })

    expect(await getSucursalActual(10)).toBe('PZ2')
  })

  it('devuelve null cuando el usuario no tiene sucursal fija (p. ej. ADMIN)', async () => {
    mockAsignacion({
      data: { uer_sucursal_id: null, sgrh_sucursales: null },
      error: null,
    })

    expect(await getSucursalActual(10)).toBeNull()
  })

  it('devuelve null si la consulta falla', async () => {
    mockAsignacion({ data: null, error: { message: 'boom' } })

    expect(await getSucursalActual(10)).toBeNull()
  })

  it('devuelve null si no hay asignación activa', async () => {
    mockAsignacion({ data: null, error: null })

    expect(await getSucursalActual(10)).toBeNull()
  })
})
