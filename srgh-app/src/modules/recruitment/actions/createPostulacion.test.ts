import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPostulacion } from './createPostulacion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { placeInFirstStage } from '../lib/stageColumns'
import { revalidatePath } from 'next/cache'
import { createSupabaseQueryMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('../lib/stageColumns', () => ({ placeInFirstStage: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const input = { pos_puesto_id: 3, pos_sucursal_id: 4, pos_observaciones: 'Reingreso' }
function setup(found = true, error: unknown = null) {
  const read = createSupabaseQueryMock({ data: found ? { cdt_id: 8 } : null, error: null })
  const write = createSupabaseQueryMock({ data: error ? null : { pos_id: 12 }, error })
  const from = vi.fn().mockReturnValueOnce(read).mockReturnValueOnce(write)
  const client = { from }
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>
  )
  return { read, write, from, client }
}

describe('create application for an existing candidate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requirePermission).mockResolvedValue({
      app_metadata: { empresa_id: 1, usr_id: 9 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it.each([0, -1, 1.5])('rejects invalid candidate %s before accessing data', async (id) => {
    expect((await createPostulacion(id, input)).ok).toBe(false)
    expect(requirePermission).not.toHaveBeenCalled()
  })
  it('validates the application before accessing data', async () => {
    expect((await createPostulacion(8, { pos_puesto_id: 0 })).ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })
  it('does not insert when candidate lookup returns no visible row', async () => {
    const { from } = setup(false)
    expect((await createPostulacion(8, input)).ok).toBe(false)
    expect(from).toHaveBeenCalledTimes(1)
    expect(placeInFirstStage).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('does not advance stages or refresh on insertion failure', async () => {
    setup(true, { message: 'failed' })
    expect((await createPostulacion(8, input)).ok).toBe(false)
    expect(placeInFirstStage).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('uses the authenticated company, places the inserted application and refreshes both views', async () => {
    const { read, write, client } = setup()
    expect(await createPostulacion(8, input)).toEqual({ ok: true, postulacionId: 12 })
    expect(requirePermission).toHaveBeenCalledWith('RECLUTAMIENTO_WRITE')
    expect(read.eq).toHaveBeenCalledWith('cdt_id', 8)
    expect(write.insert).toHaveBeenCalledWith({ ...input, pos_candidato_id: 8, pos_empresa_id: 1 })
    expect(placeInFirstStage).toHaveBeenCalledWith(client, 12, 9)
    expect(revalidatePath).toHaveBeenCalledWith('/recruitment')
    expect(revalidatePath).toHaveBeenCalledWith('/recruitment/candidates/8')
  })
})
