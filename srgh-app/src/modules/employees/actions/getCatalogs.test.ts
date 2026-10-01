import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getMotivosSalida,
  getPuestos,
  getSucursales,
  getTerritorio,
  getTiposContrato,
  getTiposDocumento,
  getTiposJornada,
  getTiposIdentificacion,
  getRoles,
} from './getCatalogs'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
// Sin Data Cache en tests: cada llamada ejecuta la consulta.
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: () => Promise<unknown>) => fn),
}))

const mockCreateClient = vi.mocked(createClient)
const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockRequirePermission = vi.mocked(requirePermission)

/** Los catálogos por empresa usan el cliente de sesión; los globales, el admin. */
function mockClient(responses: Record<string, { data: unknown; error: unknown }>) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  mockCreateAdminClient.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>)
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

  it('getMotivosSalida trae si genera cesantía, preaviso y la nota legal', async () => {
    mockClient({
      sgrh_cat_motivos_salida: {
        data: [
          {
            mot_id: 1,
            mot_nombre: 'Renuncia Voluntaria',
            mot_genera_cesantia: false,
            mot_genera_preaviso: false,
            mot_nota_legal: null,
          },
        ],
        error: null,
      },
    })

    const result = await getMotivosSalida()

    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: 1,
          nombre: 'Renuncia Voluntaria',
          generaCesantia: false,
          generaPreaviso: false,
          notaLegal: null,
        },
      ],
    })
    // No NOMINA_READ: quien termina contratos no necesariamente lo tiene.
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_READ)
  })

  it('getMotivosSalida devuelve error generico si supabase falla', async () => {
    mockClient({ sgrh_cat_motivos_salida: { data: null, error: { message: 'boom' } } })

    const result = await getMotivosSalida()

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar el catálogo.' })
  })
})

describe('caché de catálogos globales', () => {
  // Se registran al importar el módulo, antes de cualquier clearAllMocks.
  const registros = vi.mocked(unstable_cache).mock.calls.map(([, keyParts, options]) => ({
    key: keyParts?.[1],
    options,
  }))

  it('cachea solo los globales, con el tag catalogos', () => {
    expect(registros.map((r) => r.key).sort()).toEqual([
      'bancos',
      'motivos_salida',
      'territorio',
      'tipos_contrato',
      'tipos_documento',
      'tipos_identificacion',
    ])
    for (const r of registros) {
      expect(r.options?.tags).toEqual(['catalogos'])
    }
  })

  it('el guard corre antes del caché: sin permiso no se lee nada', async () => {
    vi.clearAllMocks()
    mockRequirePermission.mockRejectedValue(new Error('NEXT_REDIRECT:/unauthorized'))

    await expect(getTerritorio()).rejects.toThrow('NEXT_REDIRECT:/unauthorized')
    expect(mockCreateAdminClient).not.toHaveBeenCalled()
  })
})
