import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPeriodo } from './createPeriodo'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { CrearPeriodoInput } from '@/modules/payroll/types'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const INPUT: CrearPeriodoInput = {
  npe_sucursal_id: 2,
  npe_periodo_mes: 7,
  npe_periodo_anio: 2026,
  npe_quincena: 1,
  npe_fecha_inicio_periodo: '2026-07-01',
  npe_fecha_fin_periodo: '2026-07-15',
  npe_observaciones: null,
}

function mockInsert(result: { data: unknown; error: unknown }) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({ sgrh_nomina_periodo: result }) as unknown as Awaited<
      ReturnType<typeof createClient>
    >
  )
}

describe('createPeriodo (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza datos inválidos sin tocar la base', async () => {
    const result = await createPeriodo({ ...INPUT, npe_periodo_mes: 13 })

    expect(result).toEqual({ ok: false, error: 'Datos del periodo inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza fecha de fin anterior a la de inicio', async () => {
    const result = await createPeriodo({ ...INPUT, npe_fecha_fin_periodo: '2026-06-30' })

    expect(result).toEqual({ ok: false, error: 'Datos del periodo inválidos.' })
  })

  it('devuelve error si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
  })

  it('traduce el duplicado (23505) a un mensaje claro', async () => {
    mockInsert({ data: null, error: { code: '23505', message: 'duplicate' } })

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un periodo para esa sucursal, mes y quincena.',
    })
  })

  it('traduce el rechazo de RLS (42501) a un mensaje claro', async () => {
    mockInsert({ data: null, error: { code: '42501', message: 'rls' } })

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No tienes permiso para crear periodos de nómina.',
    })
  })

  it('crea el periodo y devuelve su id', async () => {
    mockInsert({ data: { npe_id: 99 }, error: null })

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({ ok: true, periodoId: 99 })
  })
})
