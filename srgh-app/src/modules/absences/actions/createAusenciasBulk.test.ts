import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAusenciasBulk } from './createAusenciasBulk'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock, createSupabaseQueryMock } from '@/test/supabaseMock'
import type { CreateAusenciasBulkInput } from '@/modules/absences/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const baseInput: CreateAusenciasBulkInput = {
  employmentHistoryId: 1,
  tipoAusenciaId: 2,
  ranges: [
    { fechaInicio: '2026-01-05', fechaFin: '2026-01-07' },
    { fechaInicio: '2026-01-14', fechaFin: '2026-01-15' },
  ],
}

describe('createAusenciasBulk (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza si no viene ningun periodo sin llamar a requirePermission', async () => {
    const result = await createAusenciasBulk({ ...baseInput, ranges: [] })

    expect(result).toEqual({ ok: false, error: 'Datos de la ausencia invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un periodo cuya fecha final es anterior a la de inicio', async () => {
    const result = await createAusenciasBulk({
      ...baseInput,
      ranges: [{ fechaInicio: '2026-01-08', fechaFin: '2026-01-05' }],
    })

    expect(result).toEqual({ ok: false, error: 'Datos de la ausencia invalidos.' })
  })

  it('rechaza cuando dos periodos del formulario se traslapan entre si', async () => {
    const result = await createAusenciasBulk({
      ...baseInput,
      ranges: [
        { fechaInicio: '2026-01-05', fechaFin: '2026-01-09' },
        { fechaInicio: '2026-01-08', fechaFin: '2026-01-12' },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error: 'Hay periodos que se traslapan entre si. Revise las fechas.',
    })
  })

  it('rechaza cuando un periodo choca con una ausencia ya registrada', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_ausencias: {
          data: [{ aus_fecha_inicio: '2026-01-14', aus_fecha_fin: '2026-01-16' }],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createAusenciasBulk(baseInput)

    expect(result).toEqual({
      ok: false,
      error: 'El colaborador ya tiene una ausencia registrada que se traslapa con esas fechas.',
    })
  })

  it('acepta periodos separados que no chocan con lo ya registrado', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_ausencias: [
          // La consulta por el tramo completo trae una ausencia que cae en el
          // hueco entre ambos periodos, asi que no debe bloquear el registro.
          {
            data: [{ aus_fecha_inicio: '2026-01-09', aus_fecha_fin: '2026-01-10' }],
            error: null,
          },
          { data: null, error: null },
        ],
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createAusenciasBulk(baseInput)

    expect(result).toEqual({ ok: true })
  })

  it('inserta todos los periodos en un solo statement con sus dias calculados', async () => {
    const insertBuilder = createSupabaseQueryMock({ data: null, error: null })
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(createSupabaseQueryMock({ data: [], error: null }))
        .mockReturnValueOnce(insertBuilder),
    }
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createAusenciasBulk(baseInput)

    expect(result).toEqual({ ok: true })
    expect(insertBuilder.insert).toHaveBeenCalledTimes(1)
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        aus_fecha_inicio: '2026-01-05',
        aus_fecha_fin: '2026-01-07',
        aus_dias_naturales: 3,
        aus_dias_habiles: 3,
      }),
      expect.objectContaining({
        aus_fecha_inicio: '2026-01-14',
        aus_fecha_fin: '2026-01-15',
        aus_dias_naturales: 2,
        aus_dias_habiles: 2,
      }),
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })

  it('propaga el error cuando el insert falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_ausencias: [
          { data: [], error: null },
          { data: null, error: { message: 'boom' } },
        ],
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createAusenciasBulk(baseInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo registrar la ausencia.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
