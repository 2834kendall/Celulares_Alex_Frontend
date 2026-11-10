import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboardPeople } from './getDashboardPeople'
import { createClient } from '@/lib/supabase/server'
import { getStorageProvider } from '@/lib/storage'
import { createSupabaseQueryMock } from '@/test/supabaseMock'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'

vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'No se pudo aplicar el filtro de marca.',
  getFiltroMarca: vi.fn(async () => ({ estado: 'sin-filtro', sucursalIds: null })),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))
vi.mock('@/modules/attendance/lib/time', () => ({ todayInCostaRica: () => '2026-11-06' }))

function setup(
  options: {
    meta?: Record<string, unknown>
    employees?: unknown[]
    contracts?: unknown[]
    error?: string
  } = {}
) {
  const employees = createSupabaseQueryMock({
    data: options.employees ?? [],
    error: options.error ?? null,
  })
  const contracts = createSupabaseQueryMock({ data: options.contracts ?? [], error: null })
  const from = vi.fn((table: string) => (table === 'sgrh_empleados' ? employees : contracts))
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: {
            app_metadata: options.meta ?? { empresa_id: 1, permisos: ['EMPLEADOS_READ'] },
          },
        },
      }),
    },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>)
  return { from, employees, contracts }
}

const employee = (id: number, photo: string | null = null) => ({
  emp_id: id,
  emp_nombre: 'Ana',
  emp_apellido_1: 'Perez',
  emp_apellido_2: null,
  emp_fecha_nacimiento: '1990-11-07',
  emp_fecha_ingreso_original: '2026-11-01',
  emp_foto_path: photo,
})
const contract = (id: number, branch: string | null) => ({
  lab_empleado_id: id,
  sgrh_cat_puestos: null,
  sgrh_sucursales: branch ? { suc_nombre: branch } : null,
})

describe('dashboard people loader', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    {},
    { empresa_id: 1 },
    { empresa_id: 1, permisos: 'EMPLEADOS_READ' },
    { permisos: ['EMPLEADOS_READ'] },
  ])('does not query people without company and permission: %j', async (meta) => {
    const { from } = setup({ meta })
    expect(await getDashboardPeople()).toMatchObject({
      canSee: false,
      activeCount: 0,
      todayIso: '2026-11-06',
    })
    expect(from).not.toHaveBeenCalled()
    expect(getStorageProvider).not.toHaveBeenCalled()
  })

  it('returns a readable empty dashboard for an empty company', async () => {
    const { contracts } = setup()
    expect(await getDashboardPeople()).toEqual({
      canSee: true,
      birthdays: [],
      anniversaries: [],
      newHires: [],
      team: [],
      activeCount: 0,
      todayIso: '2026-11-06',
    })
    expect(contracts.eq).toHaveBeenCalledWith('lab_empresa_id', 1)
    expect(contracts.is).toHaveBeenCalledWith('lab_fecha_fin', null)
  })

  it('hides failed queries instead of presenting them as zero staff', async () => {
    setup({ error: 'offline' })
    expect(await getDashboardPeople()).toMatchObject({ canSee: false, activeCount: 0 })
    expect(getStorageProvider).not.toHaveBeenCalled()
  })

  it('excludes former employees and signs only active photos; missing branch remains visible', async () => {
    const sign = vi.fn().mockResolvedValue({ ok: false, error: 'UNAVAILABLE' })
    vi.mocked(getStorageProvider).mockReturnValue({ getSignedUrls: sign } as unknown as ReturnType<
      typeof getStorageProvider
    >)
    setup({
      employees: [employee(1, '1/active.jpg'), employee(2, '1/former.jpg'), employee(3)],
      contracts: [contract(1, 'Centro'), contract(3, null)],
    })
    const result = await getDashboardPeople()
    expect(result.activeCount).toBe(2)
    expect(result.team).toEqual([
      { sucursal: 'Centro', count: 1 },
      { sucursal: 'Sin sucursal', count: 1 },
    ])
    expect(sign).toHaveBeenCalledWith('FOTOS_EMPLEADO', ['1/active.jpg'], expect.any(Number))
    expect(result.newHires).toHaveLength(2)
    expect(JSON.stringify(result)).not.toContain('1990')
    expect(JSON.stringify(result)).not.toContain('former.jpg')
  })
})

const FILTRO_MARCA = { estado: 'filtrado' as const, marcaId: 1, sucursalIds: [5, 6] }
const FILTRO_ERROR = { estado: 'error', sucursalIds: null } as const

describe('dashboard people with a chosen brand', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts only the contracts of that brand', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_MARCA)
    const { contracts } = setup({ employees: [employee(1)], contracts: [contract(1, 'Mall')] })

    const people = await getDashboardPeople()

    expect(contracts.in).toHaveBeenCalledWith('lab_sucursal_id', [5, 6])
    expect(people.activeCount).toBe(1)
  })

  it('does not narrow without a brand', async () => {
    const { contracts } = setup({ employees: [employee(1)], contracts: [contract(1, 'Mall')] })

    await getDashboardPeople()

    expect(contracts.in).not.toHaveBeenCalled()
  })

  it('degrades instead of showing everybody when the filter could not be read', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_ERROR)
    const { from } = setup({ employees: [employee(1)], contracts: [contract(1, 'Mall')] })

    expect((await getDashboardPeople()).canSee).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })
})
