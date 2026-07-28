import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAusencia } from './createAusencia'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { CreateAusenciaInput } from '@/modules/absences/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const baseInput: CreateAusenciaInput = {
  employmentHistoryId: 1,
  tipoAusenciaId: 2,
  fechaInicio: '2026-01-06',
  fechaFin: '2026-01-08',
}

describe('createAusencia (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza una fecha final anterior a la de inicio sin llamar a requirePermission', async () => {
    const result = await createAusencia({ ...baseInput, fechaFin: '2026-01-01' })

    expect(result).toEqual({ ok: false, error: 'Datos de la ausencia invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza si ya existe una ausencia que se traslapa', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_ausencias: { data: [{ aus_id: 5 }], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createAusencia(baseInput)

    expect(result).toEqual({
      ok: false,
      error: 'El colaborador ya tiene una ausencia registrada que se traslapa con esas fechas.',
    })
  })

  it('calcula dias naturales/habiles e inserta en exito', async () => {
    const client = createSupabaseClientMock({
      sgrh_ausencias: [
        { data: [], error: null },
        { data: null, error: null },
      ],
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createAusencia(baseInput)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })
})
