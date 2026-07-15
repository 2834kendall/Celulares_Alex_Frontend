import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPuestos,
  getSucursales,
  getTiposContrato,
  getTiposJornada,
  getTiposIdentificacion,
  getRoles,
} from './getCatalogs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

function mockClient(responses: Record<string, { data: unknown; error: unknown }>) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock(responses) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('getCatalogs (server actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('getPuestos mapea al DTO CatalogoItem', async () => {
    mockClient({
      sgrh_cat_puestos: {
        data: [{ pue_id: 1, pue_nombre: 'Cajera' }],
        error: null,
      },
    })

    const result = await getPuestos()

    expect(result).toEqual({ ok: true, data: [{ id: 1, nombre: 'Cajera' }] })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_READ)
  })

  it('getPuestos devuelve error generico si supabase falla', async () => {
    mockClient({ sgrh_cat_puestos: { data: null, error: { message: 'boom' } } })

    const result = await getPuestos()

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar el catálogo.' })
  })

  it('getSucursales mapea al DTO CatalogoItem', async () => {
    mockClient({
      sgrh_sucursales: { data: [{ suc_id: 2, suc_nombre: 'Central' }], error: null },
    })

    const result = await getSucursales()

    expect(result).toEqual({ ok: true, data: [{ id: 2, nombre: 'Central' }] })
  })

  it('getTiposContrato mapea al DTO CatalogoItem', async () => {
    mockClient({
      sgrh_cat_tipos_contrato: { data: [{ tco_id: 3, tco_nombre: 'Indefinido' }], error: null },
    })

    const result = await getTiposContrato()

    expect(result).toEqual({ ok: true, data: [{ id: 3, nombre: 'Indefinido' }] })
  })

  it('getTiposJornada mapea al DTO CatalogoItem', async () => {
    mockClient({
      sgrh_cat_tipos_jornada: { data: [{ tjo_id: 4, tjo_nombre: 'Diurna' }], error: null },
    })

    const result = await getTiposJornada()

    expect(result).toEqual({ ok: true, data: [{ id: 4, nombre: 'Diurna' }] })
  })

  it('getTiposIdentificacion mapea al DTO CatalogoItem', async () => {
    mockClient({
      sgrh_cat_tipos_identificacion: {
        data: [{ tid_id: 5, tid_nombre: 'Cédula nacional' }],
        error: null,
      },
    })

    const result = await getTiposIdentificacion()

    expect(result).toEqual({ ok: true, data: [{ id: 5, nombre: 'Cédula nacional' }] })
  })

  it('getRoles exige USUARIOS_WRITE y mapea al DTO CatalogoItem', async () => {
    mockClient({
      sgrh_cat_roles: { data: [{ rol_id: 6, rol_nombre: 'Empleado' }], error: null },
    })

    const result = await getRoles()

    expect(result).toEqual({ ok: true, data: [{ id: 6, nombre: 'Empleado' }] })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })
})
