import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDashboardAbsences,
  getDashboardEvaluations,
  getExpiringContracts,
  getMyAbsences,
  getMyEvaluations,
  getWeekSchedule,
} from './getDashboardExtras'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseQueryMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

function setup(meta: Record<string, unknown> = {}, error: unknown = null) {
  const query = createSupabaseQueryMock({ data: [], error })
  const from = vi.fn(() => query)
  vi.mocked(createClient).mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { app_metadata: meta } } }) },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>)
  return { query, from }
}
const today = '2026-11-06'

describe('dashboard optional loaders authorization and failures', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    () => getDashboardAbsences(today),
    () => getDashboardEvaluations(today),
    () => getExpiringContracts(today),
    () => getWeekSchedule(today),
  ])('does not query protected panels without permission', async (load) => {
    const { from } = setup({ empresa_id: 1, permisos: [] })
    expect(await load()).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('returns empty personal panels without an employee identity', async () => {
    const { from } = setup({ empresa_id: 1, permisos: ['AUSENCIAS_READ', 'EVALUACIONES_READ'] })
    expect(await getMyAbsences(today)).toEqual({ pending: 0, absences: [] })
    expect(await getMyEvaluations()).toEqual({ evaluations: [], delta: null })
    expect(from).not.toHaveBeenCalled()
  })

  it('filters personal absences by employee even with broad read permission', async () => {
    const { query } = setup({ empresa_id: 1, emp_id: 42, permisos: ['AUSENCIAS_READ'] })
    expect(await getMyAbsences(today)).toEqual({ pending: 0, absences: [] })
    expect(query.eq).toHaveBeenCalledWith('sgrh_historial_laboral.lab_empleado_id', 42)
    expect(query.gte).toHaveBeenCalledWith('aus_fecha_fin', '2026-10-07')
  })

  it('excludes evaluation drafts, bounds history and filters to the reader', async () => {
    const { query } = setup({ empresa_id: 1, emp_id: 42, permisos: ['EVALUACIONES_READ'] })
    await getMyEvaluations()
    expect(query.eq).toHaveBeenCalledWith('sgrh_historial_laboral.lab_empleado_id', 42)
    expect(query.neq).toHaveBeenCalledWith('eve_estado', 'borrador')
    expect(query.limit).toHaveBeenCalledWith(12)
    expect(query.order).toHaveBeenCalledWith('eve_fecha_evaluacion', { ascending: false })
  })

  it.each([() => getMyAbsences(today), () => getMyEvaluations()])(
    'represents personal query failure as unavailable, not empty',
    async (load) => {
      setup({ empresa_id: 1, emp_id: 42 }, { message: 'offline' })
      expect(await load()).toBeNull()
    }
  )

  it('filters active roster by company and stops when the roster fails', async () => {
    const { query, from } = setup(
      { empresa_id: 7, permisos: ['AUSENCIAS_READ'] },
      { message: 'offline' }
    )
    expect(await getDashboardAbsences(today)).toBeNull()
    expect(query.eq).toHaveBeenCalledWith('lab_empresa_id', 7)
    expect(query.is).toHaveBeenCalledWith('lab_fecha_fin', null)
    expect(from).not.toHaveBeenCalledWith('sgrh_ausencias')
  })
})
