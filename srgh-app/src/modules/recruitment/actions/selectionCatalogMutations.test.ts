import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { createCriterioSeleccion } from './createCriterioSeleccion'
import { updateCriterioSeleccion } from './updateCriterioSeleccion'
import { deleteCriterioSeleccion } from './deleteCriterioSeleccion'
import { updateEtapaSeleccion } from './updateEtapaSeleccion'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const areaTable = 'sgrh_cat_areas_seleccion'
const criterionTable = 'sgrh_cat_criterios_seleccion'
const stageTable = 'sgrh_cat_etapas_seleccion'
const input = {
  nombre: ' Servicio ',
  descripcion: ' Atención al cliente ',
  color: '#123abc',
  peso: 2,
}
const normalized = {
  nombre: 'Servicio',
  descripcion: 'Atención al cliente',
  color: '#123abc',
  peso: 2,
}
const ok = { data: null, error: null }
const failed = { data: null, error: { message: 'provider failure' } }
type Client = ReturnType<typeof createSupabaseClientMock>
function setup(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>
  )
  return client
}
function query(client: Client, table: string, index = 0) {
  const positions = client.from.mock.calls.flatMap(([name], i) => (name === table ? [i] : []))
  return client.from.mock.results[positions[index]].value as Record<
    string,
    ReturnType<typeof vi.fn>
  >
}
beforeEach(() => {
  vi.resetAllMocks()
})

describe('selection catalog authorization', () => {
  it.each([
    ['create criterion', () => createCriterioSeleccion(input)],
    ['update criterion', () => updateCriterioSeleccion(4, 8, input)],
    ['delete criterion', () => deleteCriterioSeleccion(4)],
    ['update stage', () => updateEtapaSeleccion(4, { nombre: 'Entrevista', color: null })],
  ] as const)('%s requires catalog permission before touching the database', async (_, action) => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error('forbidden'))
    await expect(action()).rejects.toThrow('forbidden')
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith('CATALOGOS_WRITE')
    expect(createClient).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('selection criterion creation', () => {
  it.each([
    { ...input, nombre: 'a' },
    { ...input, descripcion: '' },
    { ...input, color: '#xyz' },
    { ...input, peso: 0 },
    { ...input, peso: 11 },
  ])('rejects invalid catalog data %s', async (bad) => {
    expect(await createCriterioSeleccion(bad)).toEqual({
      ok: false,
      error: 'Datos del criterio inválidos.',
    })
    expect(createClient).not.toHaveBeenCalled()
  })
  it('persists the normalized area and matching active description', async () => {
    const client = setup({
      [areaTable]: { data: { are_id: 4 }, error: null },
      [criterionTable]: ok,
    })
    expect(await createCriterioSeleccion(input)).toEqual({ ok: true, id: 4 })
    expect(query(client, areaTable).insert).toHaveBeenCalledWith({
      are_nombre: normalized.nombre,
      are_tipo_aplicacion: 'ambos',
      are_activo: true,
      are_color: normalized.color,
      are_peso: normalized.peso,
    })
    expect(query(client, criterionTable).insert).toHaveBeenCalledWith({
      cri_area_id: 4,
      cri_descripcion: normalized.descripcion,
      cri_activo: true,
    })
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/recruitment')
  })
  it('does not create a description after a failed area insert', async () => {
    const client = setup({ [areaTable]: failed })
    expect(await createCriterioSeleccion(input)).toMatchObject({ ok: false })
    expect(client.from).not.toHaveBeenCalledWith(criterionTable)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('rolls back exactly the newly created area when the description fails', async () => {
    const client = setup({
      [areaTable]: [{ data: { are_id: 42 }, error: null }, ok],
      [criterionTable]: failed,
    })
    expect(await createCriterioSeleccion(input)).toEqual({
      ok: false,
      error: 'No se pudo guardar la descripción del criterio.',
    })
    expect(query(client, areaTable, 1).delete).toHaveBeenCalledOnce()
    expect(query(client, areaTable, 1).eq).toHaveBeenCalledWith('are_id', 42)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('selection criterion editing', () => {
  it('rejects invalid edits before authorization or writes', async () => {
    expect(await updateCriterioSeleccion(4, 8, { ...input, nombre: '' })).toMatchObject({
      ok: false,
    })
    expect(requirePermission).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })
  it.each([8, null])(
    'updates the area and the existing or legacy criterion (%s)',
    async (criterioId) => {
      const client = setup({ [areaTable]: ok, [criterionTable]: ok })
      expect(await updateCriterioSeleccion(4, criterioId, input)).toEqual({ ok: true })
      expect(query(client, areaTable).eq).toHaveBeenCalledWith('are_id', 4)
      expect(query(client, areaTable).update).toHaveBeenCalledWith({
        are_nombre: 'Servicio',
        are_color: '#123abc',
        are_peso: 2,
      })
      if (criterioId) {
        expect(query(client, criterionTable).update).toHaveBeenCalledWith({
          cri_descripcion: 'Atención al cliente',
        })
        expect(query(client, criterionTable).eq).toHaveBeenCalledWith('cri_id', 8)
      } else {
        expect(query(client, criterionTable).insert).toHaveBeenCalledWith({
          cri_area_id: 4,
          cri_descripcion: 'Atención al cliente',
          cri_activo: true,
        })
      }
      expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/recruitment')
    }
  )
  it('does not change descriptions when the area update fails', async () => {
    const client = setup({ [areaTable]: failed })
    expect(await updateCriterioSeleccion(4, 8, input)).toMatchObject({ ok: false })
    expect(client.from).not.toHaveBeenCalledWith(criterionTable)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it.each([8, null])(
    'reports description failure in existing/legacy mode %s',
    async (criterioId) => {
      setup({ [areaTable]: ok, [criterionTable]: failed })
      expect(await updateCriterioSeleccion(4, criterioId, input)).toEqual({
        ok: false,
        error: 'No se pudo actualizar la descripción del criterio.',
      })
      expect(revalidatePath).not.toHaveBeenCalled()
    }
  )
})

describe('selection criterion removal and historical preservation', () => {
  it('deletes children and their exact parent before refreshing', async () => {
    const client = setup({ [areaTable]: ok, [criterionTable]: ok })
    expect(await deleteCriterioSeleccion(4)).toEqual({ ok: true })
    expect(client.from.mock.calls.map(([name]) => name)).toEqual([criterionTable, areaTable])
    expect(query(client, criterionTable).eq).toHaveBeenCalledWith('cri_area_id', 4)
    expect(query(client, areaTable).eq).toHaveBeenCalledWith('are_id', 4)
    expect(query(client, areaTable).update).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/recruitment')
  })
  it.each(['child', 'parent'])(
    'archives both catalog rows when %s deletion is blocked',
    async (blocked) => {
      const client = setup({
        [criterionTable]: [blocked === 'child' ? failed : ok, ok],
        [areaTable]: blocked === 'child' ? ok : [failed, ok],
      })
      expect(await deleteCriterioSeleccion(4)).toEqual({ ok: true })
      expect(query(client, criterionTable, 1).update).toHaveBeenCalledWith({ cri_activo: false })
      expect(query(client, criterionTable, 1).eq).toHaveBeenCalledWith('cri_area_id', 4)
      const area = query(client, areaTable, blocked === 'child' ? 0 : 1)
      expect(area.update).toHaveBeenCalledWith({ are_activo: false })
      expect(area.eq).toHaveBeenCalledWith('are_id', 4)
      if (blocked === 'child') expect(area.delete).not.toHaveBeenCalled()
    }
  )
  it.each(['child', 'parent'])('does not report success if %s archival fails', async (broken) => {
    setup({
      [criterionTable]: [failed, broken === 'child' ? failed : ok],
      [areaTable]: broken === 'parent' ? failed : ok,
    })
    expect(await deleteCriterioSeleccion(4)).toEqual({
      ok: false,
      error: 'No se pudo eliminar el criterio.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('selection stage editing', () => {
  it.each([0, -1, 1.5, NaN])('rejects invalid stage IDs (%s) before any write', async (id) => {
    expect(await updateEtapaSeleccion(id, { nombre: 'Entrevista', color: null })).toEqual({
      ok: false,
      error: 'Columna no encontrada.',
    })
    expect(createClient).not.toHaveBeenCalled()
  })
  it('rejects invalid names and colors', async () => {
    expect(await updateEtapaSeleccion(4, { nombre: '', color: '#xyz' })).toEqual({
      ok: false,
      error: 'Datos de la columna inválidos.',
    })
    expect(createClient).not.toHaveBeenCalled()
  })
  it('renames/recolors only the selected stage and refreshes both consumers', async () => {
    const client = setup({ [stageTable]: ok })
    expect(await updateEtapaSeleccion(4, { nombre: ' Entrevista ', color: null })).toEqual({
      ok: true,
    })
    expect(query(client, stageTable).update).toHaveBeenCalledWith({
      eta_nombre: 'Entrevista',
      eta_color: null,
    })
    expect(query(client, stageTable).eq).toHaveBeenCalledWith('eta_id', 4)
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/recruitment'],
      ['/settings/recruitment/stages'],
    ])
  })
  it.each([true, false])('explains a duplicate name with active state %s', async (active) => {
    setup({
      [stageTable]: [
        { data: null, error: { code: '23505' } },
        { data: { eta_activo: active }, error: null },
      ],
    })
    const result = await updateEtapaSeleccion(4, { nombre: 'Entrevista', color: null })
    expect(result).toEqual({
      ok: false,
      error: active
        ? 'Ya existe una columna con ese nombre.'
        : 'Ya existe una etapa desactivada con ese nombre. Restáurela desde Configuración → Etapas de selección.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('keeps provider errors separate from successful renames', async () => {
    setup({ [stageTable]: failed })
    expect(await updateEtapaSeleccion(4, { nombre: 'Entrevista', color: null })).toEqual({
      ok: false,
      error: 'No se pudo actualizar la columna.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
