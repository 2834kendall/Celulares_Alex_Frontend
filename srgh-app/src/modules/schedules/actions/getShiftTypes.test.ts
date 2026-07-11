import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getShiftTypes } from './getShiftTypes'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ShiftType } from './getShiftTypes'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

describe('getShiftTypes (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no exige un permiso especifico: es un catalogo global', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_jornada: { data: [], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getShiftTypes()

    expect(result).toEqual({ ok: true, data: [] })
  })

  it('devuelve error generico si supabase falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_jornada: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getShiftTypes()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los tipos de jornada.' })
  })

  it('devuelve la lista de tipos de jornada en exito', async () => {
    const data: ShiftType[] = [
      {
        tjo_id: 1,
        tjo_codigo: 'DIURNA',
        tjo_nombre: 'Diurna',
        tjo_horas_max_diarias: 8,
        tjo_horas_max_semanales: 48,
        tjo_recargo_porcentaje: 0,
      } as ShiftType,
    ]
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_jornada: { data, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getShiftTypes()

    expect(result).toEqual({ ok: true, data })
  })
})
