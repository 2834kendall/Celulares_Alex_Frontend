import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateShiftType } from './updateShiftType'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ShiftTypeInput } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: ShiftTypeInput = {
  tjo_codigo: 'JORNADA_MIXTA',
  tjo_nombre: 'Jornada Mixta',
  tjo_horas_max_diarias: '8',
  tjo_horas_max_semanales: '48',
  tjo_recargo_porcentaje: 25,
}

describe('updateShiftType (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un recargo fuera de rango sin llamar a requirePermission', async () => {
    const result = await updateShiftType(1, { ...validInput, tjo_recargo_porcentaje: 150 })

    expect(result).toEqual({ ok: false, error: 'Datos de tipo de jornada invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('devuelve error de codigo repetido si supabase falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_jornada: { data: null, error: { message: 'duplicate key' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateShiftType(1, validInput)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo actualizar el tipo de jornada. Verifique que el codigo no este repetido.',
    })
  })

  it('actualiza el tipo de jornada y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_jornada: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateShiftType(1, validInput)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })
})
