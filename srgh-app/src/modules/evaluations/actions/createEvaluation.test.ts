import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvaluation } from './createEvaluation'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { EvaluationInput } from '@/modules/evaluations/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: EvaluationInput = {
  labId: 12,
  tipo: 'Mensual',
  periodoInicio: '2026-06-01',
  periodoFin: '2026-06-30',
  scores: [
    { criterioId: 1, puntaje: 9, observacion: 'saluda con cordialidad', noAplica: false },
    { criterioId: 2, puntaje: null, observacion: '', noAplica: true },
  ],
  fortalezas: ['Compromiso'],
  mejoras: ['Orden'],
  comentarios: 'Buen período.',
}

function mockClaims(meta: Record<string, unknown>) {
  mockRequirePermission.mockResolvedValue({
    app_metadata: meta,
  } as unknown as Awaited<ReturnType<typeof requirePermission>>)
}

describe('createEvaluation (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClaims({ empresa_id: 1, usr_id: 2 })
  })

  it('rechaza un periodo invertido sin llamar a requirePermission', async () => {
    const result = await createEvaluation({
      ...validInput,
      periodoInicio: '2026-06-30',
      periodoFin: '2026-06-01',
    })

    expect(result).toEqual({ ok: false, error: 'Datos de la evaluacion invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza notas fuera del rango 0-10', async () => {
    const result = await createEvaluation({
      ...validInput,
      scores: [{ criterioId: 1, puntaje: 11, observacion: '', noAplica: false }],
    })

    expect(result).toEqual({ ok: false, error: 'Datos de la evaluacion invalidos.' })
  })

  it('rechaza una evaluacion donde ningun rubro aplica', async () => {
    const result = await createEvaluation({
      ...validInput,
      scores: [{ criterioId: 1, puntaje: null, observacion: '', noAplica: true }],
    })

    expect(result).toEqual({ ok: false, error: 'Datos de la evaluacion invalidos.' })
  })

  it('falla si la sesion no trae empresa o usuario', async () => {
    mockClaims({})

    const result = await createEvaluation(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la sesion del evaluador.' })
  })

  it('falla si el colaborador no pertenece a la empresa', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: null, error: { message: 'not found' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createEvaluation(validInput)

    expect(result).toEqual({ ok: false, error: 'El colaborador seleccionado no es valido.' })
  })

  it('revierte la evaluacion si fallan los resultados por rubro', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: { lab_id: 12, lab_sucursal_id: 4 }, error: null },
        sgrh_evaluaciones: { data: { eve_id: 55 }, error: null },
        sgrh_evaluacion_resultados: { data: null, error: { message: 'fk violation' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createEvaluation(validInput)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron guardar las calificaciones por rubro.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('registra la evaluacion completa y revalida la ruta', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: { lab_id: 12, lab_sucursal_id: 4 }, error: null },
        sgrh_evaluaciones: { data: { eve_id: 90 }, error: null },
        sgrh_evaluacion_resultados: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createEvaluation(validInput)

    expect(result).toEqual({ ok: true, id: 90 })
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations')
  })
})
