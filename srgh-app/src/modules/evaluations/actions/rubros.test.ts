import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRubros } from './getRubros'
import { deleteRubro } from './deleteRubro'
import { updateRubro } from './updateRubro'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission, requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: vi.fn(),
  requireAnyPermission: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
function setup(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>
  )
  return client
}
const ok = { data: null, error: null }
beforeEach(() => vi.resetAllMocks())
describe('evaluation rubric reads and historical preservation', () => {
  it('maps the active criterion and handles an older area with no criteria', async () => {
    const client = setup({
      sgrh_cat_areas_evaluacion: {
        data: [
          {
            are_id: 1,
            are_nombre: 'Servicio',
            are_activo: true,
            sgrh_cat_criterios_evaluacion: [
              { cri_id: 2, cri_descripcion: 'Anterior', cri_activo: false },
              { cri_id: 3, cri_descripcion: 'Actual', cri_activo: true },
            ],
          },
          { are_id: 4, are_nombre: 'Legado', are_activo: true, sgrh_cat_criterios_evaluacion: [] },
        ],
        error: null,
      },
    })
    expect(await getRubros()).toEqual({
      ok: true,
      data: [
        { areaId: 1, criterioId: 3, nombre: 'Servicio', descripcion: 'Actual', activo: true },
        { areaId: 4, criterioId: null, nombre: 'Legado', descripcion: '', activo: true },
      ],
    })
    expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith('are_activo', true)
    expect(requireAnyPermission).toHaveBeenCalledWith(['EVALUACIONES_READ', 'EVALUACIONES_WRITE'])
  })
  it('distinguishes an empty catalog from a failed query', async () => {
    setup({ sgrh_cat_areas_evaluacion: { data: [], error: null } })
    expect(await getRubros()).toEqual({ ok: true, data: [] })
    setup({ sgrh_cat_areas_evaluacion: { data: null, error: { message: 'offline' } } })
    expect((await getRubros()).ok).toBe(false)
  })
  it('deletes criteria and their area with exact predicates before refreshing', async () => {
    const client = setup({ sgrh_cat_criterios_evaluacion: ok, sgrh_cat_areas_evaluacion: ok })
    expect(await deleteRubro(7)).toEqual({ ok: true })
    const [criteria, area] = client.from.mock.results.map((result) => result.value)
    expect(criteria.delete).toHaveBeenCalledOnce()
    expect(criteria.eq).toHaveBeenCalledWith('cri_area_id', 7)
    expect(area.delete).toHaveBeenCalledOnce()
    expect(area.eq).toHaveBeenCalledWith('are_id', 7)
    expect(requirePermission).toHaveBeenCalledWith('CATALOGOS_WRITE')
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations')
  })
  it('archives referenced criteria and area without deleting the historical area', async () => {
    const client = setup({
      sgrh_cat_criterios_evaluacion: [{ data: null, error: { code: '23503' } }, ok],
      sgrh_cat_areas_evaluacion: ok,
    })
    expect(await deleteRubro(7)).toEqual({ ok: true })
    const queries = client.from.mock.results.map((result) => result.value)
    expect(queries[1].update).toHaveBeenCalledWith({ cri_activo: false })
    expect(queries[1].eq).toHaveBeenCalledWith('cri_area_id', 7)
    expect(queries[2].update).toHaveBeenCalledWith({ are_activo: false })
    expect(queries[2].eq).toHaveBeenCalledWith('are_id', 7)
    expect(queries[2].delete).not.toHaveBeenCalled()
  })
  it('does not announce success if archival fails', async () => {
    setup({
      sgrh_cat_criterios_evaluacion: [
        { data: null, error: { code: '23503' } },
        { data: null, error: { message: 'offline' } },
      ],
      sgrh_cat_areas_evaluacion: ok,
    })
    expect(await deleteRubro(7)).toEqual({ ok: false, error: 'No se pudo eliminar el rubro.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('does not touch data after denied catalog permission', async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
    await expect(deleteRubro(7)).rejects.toThrow('forbidden')
    expect(createClient).not.toHaveBeenCalled()
  })
  it('does not query when rubric validation fails', async () => {
    expect((await updateRubro(7, 8, { nombre: '', descripcion: '' })).ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })
  it('does not change criteria when updating the area fails', async () => {
    const client = setup({
      sgrh_cat_areas_evaluacion: { data: null, error: { message: 'duplicate' } },
    })
    expect((await updateRubro(7, 8, { nombre: 'Servicio', descripcion: 'Atención' })).ok).toBe(
      false
    )
    expect(client.from).not.toHaveBeenCalledWith('sgrh_cat_criterios_evaluacion')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('updates the selected criterion and area without inserting duplicates', async () => {
    const client = setup({ sgrh_cat_areas_evaluacion: ok, sgrh_cat_criterios_evaluacion: ok })
    expect(await updateRubro(7, 8, { nombre: 'Servicio', descripcion: 'Atención' })).toEqual({
      ok: true,
    })
    const [area, criterion] = client.from.mock.results.map((result) => result.value)
    expect(area.update).toHaveBeenCalledWith({ are_nombre: 'Servicio' })
    expect(area.eq).toHaveBeenCalledWith('are_id', 7)
    expect(criterion.update).toHaveBeenCalledWith({ cri_descripcion: 'Atención' })
    expect(criterion.eq).toHaveBeenCalledWith('cri_id', 8)
    expect(criterion.insert).not.toHaveBeenCalled()
  })
  it('creates a criterion for a legacy rubric that has none', async () => {
    const client = setup({ sgrh_cat_areas_evaluacion: ok, sgrh_cat_criterios_evaluacion: ok })
    expect(await updateRubro(7, null, { nombre: 'Servicio', descripcion: 'Atención' })).toEqual({
      ok: true,
    })
    expect(client.from.mock.results[1].value.insert).toHaveBeenCalledWith({
      cri_area_id: 7,
      cri_descripcion: 'Atención',
      cri_activo: true,
    })
  })
  it('does not refresh or claim success when the criterion write fails', async () => {
    setup({
      sgrh_cat_areas_evaluacion: ok,
      sgrh_cat_criterios_evaluacion: { data: null, error: { message: 'offline' } },
    })
    expect((await updateRubro(7, 8, { nombre: 'Servicio', descripcion: 'Atención' })).ok).toBe(
      false
    )
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
