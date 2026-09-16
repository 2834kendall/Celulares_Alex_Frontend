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

  it('devuelve vacio sin consultar si no hay usr_id', async () => {
    expect(await getSucursalActual(null)).toEqual([])
    expect(await getSucursalActual(undefined)).toEqual([])
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('devuelve el nombre de la unica sucursal asignada', async () => {
    mockAsignacion({
      data: [{ uer_sucursal_id: 2, sgrh_sucursales: { suc_nombre: 'PZ2' } }],
      error: null,
    })

    expect(await getSucursalActual(10)).toEqual(['PZ2'])
  })

  it('devuelve los nombres de varias sucursales asignadas', async () => {
    mockAsignacion({
      data: [
        { uer_sucursal_id: 2, sgrh_sucursales: { suc_nombre: 'PZ2' } },
        { uer_sucursal_id: 3, sgrh_sucursales: { suc_nombre: 'Escazu' } },
      ],
      error: null,
    })

    expect(await getSucursalActual(10)).toEqual(['PZ2', 'Escazu'])
  })

  it('devuelve vacio cuando el usuario no tiene sucursal fija (p. ej. ADMIN)', async () => {
    mockAsignacion({
      data: [{ uer_sucursal_id: null, sgrh_sucursales: null }],
      error: null,
    })

    expect(await getSucursalActual(10)).toEqual([])
  })

  it('devuelve vacio si CUALQUIER fila activa opera a nivel empresa', async () => {
    // Sin restriccion prevalece: no tiene sentido mostrar "sucursal A" si esa
    // misma fila tambien ve toda la empresa por otra asignacion.
    mockAsignacion({
      data: [
        { uer_sucursal_id: 2, sgrh_sucursales: { suc_nombre: 'PZ2' } },
        { uer_sucursal_id: null, sgrh_sucursales: null },
      ],
      error: null,
    })

    expect(await getSucursalActual(10)).toEqual([])
  })

  it('devuelve vacio si la consulta falla', async () => {
    mockAsignacion({ data: null, error: { message: 'boom' } })

    expect(await getSucursalActual(10)).toEqual([])
  })

  it('devuelve vacio si no hay asignacion activa', async () => {
    mockAsignacion({ data: [], error: null })

    expect(await getSucursalActual(10)).toEqual([])
  })
})
