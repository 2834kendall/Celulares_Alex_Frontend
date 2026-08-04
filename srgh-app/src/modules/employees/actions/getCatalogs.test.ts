import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPuestos,
  getSucursales,
  getTerritorio,
  getTiposContrato,
  getTiposDocumento,
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

  it('getTiposDocumento exige DOCUMENTOS_READ y mapea al DTO CatalogoItem', async () => {
    mockClient({
      sgrh_cat_tipos_documento: { data: [{ tdo_id: 7, tdo_nombre: 'Contrato' }], error: null },
    })

    const result = await getTiposDocumento()

    expect(result).toEqual({ ok: true, data: [{ id: 7, nombre: 'Contrato' }] })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.DOCUMENTOS_READ)
  })

  it('getTiposDocumento devuelve error generico si supabase falla', async () => {
    mockClient({ sgrh_cat_tipos_documento: { data: null, error: { message: 'boom' } } })

    const result = await getTiposDocumento()

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar el catálogo.' })
  })

  it('getRoles exige USUARIOS_WRITE y mapea al DTO CatalogoItem', async () => {
    mockClient({
      sgrh_cat_roles: { data: [{ rol_id: 6, rol_nombre: 'Empleado' }], error: null },
    })

    const result = await getRoles()

    expect(result).toEqual({ ok: true, data: [{ id: 6, nombre: 'Empleado' }] })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })

  it('getTerritorio arma el árbol con el id del padre en cada nivel', async () => {
    mockClient({
      sgrh_cat_provincias: { data: [{ prv_id: 1, prv_nombre: 'San José' }], error: null },
      sgrh_cat_cantones: {
        data: [{ can_id: 11, can_nombre: 'Escazú', can_provincia_id: 1 }],
        error: null,
      },
      sgrh_cat_distritos: {
        data: [{ dis_id: 101, dis_nombre: 'Carmen', dis_canton_id: 11, dis_codigo: '10101' }],
        error: null,
      },
    })

    const result = await getTerritorio()

    expect(result).toEqual({
      ok: true,
      data: {
        provincias: [{ id: 1, nombre: 'San José' }],
        cantones: [{ id: 11, nombre: 'Escazú', provinciaId: 1 }],
        // codigoPostal sale de dis_codigo: en CR son el mismo número.
        distritos: [{ id: 101, nombre: 'Carmen', cantonId: 11, codigoPostal: '10101' }],
      },
    })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_READ)
  })

  it('getTerritorio falla si cualquiera de los tres niveles falla', async () => {
    mockClient({
      sgrh_cat_provincias: { data: [{ prv_id: 1, prv_nombre: 'San José' }], error: null },
      sgrh_cat_cantones: { data: null, error: { message: 'boom' } },
      sgrh_cat_distritos: { data: [], error: null },
    })

    const result = await getTerritorio()

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar el catálogo.' })
  })
})
