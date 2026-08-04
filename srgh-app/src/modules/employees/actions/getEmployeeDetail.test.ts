import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmployeeDetail } from './getEmployeeDetail'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { getStorageProvider } from '@/lib/storage'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { StorageProvider } from '@/lib/storage/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockGetStorageProvider = vi.mocked(getStorageProvider)

function mockProvider(overrides: Partial<StorageProvider> = {}) {
  const provider = {
    upload: vi.fn(),
    getSignedUrl: vi.fn(async () => ({ ok: true as const, data: 'https://cdn/foto.jpg?token=t' })),
    getSignedUrls: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  }
  mockGetStorageProvider.mockReturnValue(provider as unknown as StorageProvider)
  return provider
}

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const EMPLEADO_ROW = {
  emp_id: 10,
  emp_nombre: 'Ana',
  emp_apellido_1: 'Mora',
  sgrh_cat_tipos_identificacion: { tid_nombre: 'Cédula nacional' },
}

const HISTORIAL_ROW = {
  lab_id: 5,
  lab_empleado_id: 10,
  lab_salario_base: 500000,
  sgrh_cat_puestos: { pue_nombre: 'Cajera' },
  sgrh_sucursales: { suc_nombre: 'Central' },
  sgrh_cat_tipos_contrato: { tco_nombre: 'Indefinido' },
  sgrh_cat_tipos_jornada: { tjo_nombre: 'Diurna' },
}

describe('getEmployeeDetail (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza ids inválidos sin tocar permisos ni DB', async () => {
    const result = await getEmployeeDetail(-1)

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.', notFound: true })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('marca notFound cuando el empleado no existe', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: { data: null, error: null },
        sgrh_historial_laboral: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getEmployeeDetail(99)

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.', notFound: true })
  })

  it('devuelve error generico si falla la carga del empleado', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: { data: null, error: { message: 'boom' } },
        sgrh_historial_laboral: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getEmployeeDetail(10)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar el empleado.' })
  })

  it('mapea empleado + historial activo + datos de pago', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: { data: EMPLEADO_ROW, error: null },
        sgrh_historial_laboral: { data: HISTORIAL_ROW, error: null },
        sgrh_empleado_datos_pago: {
          data: {
            edp_banco_id: 3,
            edp_tipo_cuenta: 'AHORRO',
            edp_numero_cuenta: 'CR02010200000000000001',
            sgrh_cat_bancos: { ban_nombre: 'BAC Credomatic' },
          },
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getEmployeeDetail(10)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.tipo_identificacion_nombre).toBe('Cédula nacional')
    expect(result.data.historial_activo).toMatchObject({
      lab_id: 5,
      puesto_nombre: 'Cajera',
      sucursal_nombre: 'Central',
      tipo_contrato_nombre: 'Indefinido',
      tipo_jornada_nombre: 'Diurna',
    })
    // El join se aplana a banco_nombre; el objeto crudo del join no se expone.
    expect(result.data.datos_pago).toEqual({
      edp_banco_id: 3,
      banco_nombre: 'BAC Credomatic',
      edp_tipo_cuenta: 'AHORRO',
      edp_numero_cuenta: 'CR02010200000000000001',
    })
    expect(result.data).not.toHaveProperty('sgrh_cat_tipos_identificacion')
  })

  it('devuelve historial y datos de pago null cuando no existen (o la RLS los oculta)', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: { data: EMPLEADO_ROW, error: null },
        sgrh_historial_laboral: { data: null, error: null },
        sgrh_empleado_datos_pago: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getEmployeeDetail(10)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.historial_activo).toBeNull()
    expect(result.data.datos_pago).toBeNull()
  })

  it('sin emp_foto_path no llama al proveedor y foto_url es null', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: { data: { ...EMPLEADO_ROW, emp_foto_path: null }, error: null },
        sgrh_historial_laboral: { data: null, error: null },
        sgrh_empleado_datos_pago: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getEmployeeDetail(10)

    expect(mockGetStorageProvider).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.foto_url).toBeNull()
  })

  it('con emp_foto_path firma UNA url y la expone como foto_url', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: {
          data: { ...EMPLEADO_ROW, emp_foto_path: '1/empleados/10/a.jpg' },
          error: null,
        },
        sgrh_historial_laboral: { data: null, error: null },
        sgrh_empleado_datos_pago: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
    const provider = mockProvider()

    const result = await getEmployeeDetail(10)

    expect(provider.getSignedUrl).toHaveBeenCalledWith(
      'FOTOS_EMPLEADO',
      '1/empleados/10/a.jpg',
      expect.any(Number)
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.foto_url).toBe('https://cdn/foto.jpg?token=t')
  })

  it('si el firmado falla, la ficha igual se muestra con foto_url null', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: {
          data: { ...EMPLEADO_ROW, emp_foto_path: '1/empleados/10/a.jpg' },
          error: null,
        },
        sgrh_historial_laboral: { data: null, error: null },
        sgrh_empleado_datos_pago: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
    mockProvider({
      getSignedUrl: vi.fn(async () => ({ ok: false as const, error: 'NOT_FOUND' as const })),
    })

    const result = await getEmployeeDetail(10)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.foto_url).toBeNull()
  })
})
