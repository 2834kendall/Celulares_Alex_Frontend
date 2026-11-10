import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateEvaluationNotes } from './updateEvaluationNotes'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseQueryMock } from '@/test/supabaseMock'
import { serializeNotes } from '../lib/scoring'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const notes = { fortalezas: ['Servicio'], mejoras: ['Orden'], comentarios: 'Buen progreso' }
function setup(data: unknown = { eve_id: 8 }, error: unknown = null) {
  const query = createSupabaseQueryMock({ data, error })
  vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => query) } as unknown as Awaited<
    ReturnType<typeof createClient>
  >)
  return query
}
beforeEach(() => vi.resetAllMocks())
describe('evaluation note updates', () => {
  it.each([0, -1, 1.5, NaN])('rejects invalid id %s before access', async (id) => {
    expect((await updateEvaluationNotes(id, notes)).ok).toBe(false)
    expect(requirePermission).not.toHaveBeenCalled()
  })
  it('validates note limits before creating a client', async () => {
    expect((await updateEvaluationNotes(8, { ...notes, comentarios: 'x'.repeat(601) })).ok).toBe(
      false
    )
    expect(createClient).not.toHaveBeenCalled()
  })
  it('denies access before updating', async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
    await expect(updateEvaluationNotes(8, notes)).rejects.toThrow('forbidden')
    expect(createClient).not.toHaveBeenCalled()
  })
  it('does not report a missing or RLS-invisible evaluation as successfully saved', async () => {
    setup(null)
    expect((await updateEvaluationNotes(8, notes)).ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('does not refresh on database error', async () => {
    setup(null, { message: 'private detail' })
    expect(await updateEvaluationNotes(8, notes)).toEqual({
      ok: false,
      error: 'No se pudieron guardar las notas de la evaluacion.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('serializes notes and confirms the exact updated evaluation before refreshing', async () => {
    const query = setup()
    expect(await updateEvaluationNotes(8, notes)).toEqual({ ok: true })
    expect(requirePermission).toHaveBeenCalledWith('EVALUACIONES_WRITE')
    expect(query.update).toHaveBeenCalledWith({ eve_observaciones: serializeNotes(notes) })
    expect(query.eq).toHaveBeenCalledWith('eve_id', 8)
    expect(query.select).toHaveBeenCalledWith('eve_id')
    expect(query.maybeSingle).toHaveBeenCalledOnce()
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations')
  })
})
