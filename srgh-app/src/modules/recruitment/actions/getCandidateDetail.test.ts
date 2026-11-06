import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCandidateDetail } from './getCandidateDetail'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseQueryMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

function setup(failedTable?: string, missing = false) {
  const queries = new Map<string, ReturnType<typeof createSupabaseQueryMock>>()
  const from = vi.fn((table: string) => {
    const data =
      table === 'sgrh_candidatos'
        ? missing
          ? null
          : { cdt_id: 8, cdt_nombre: 'Ana', sgrh_cat_tipos_identificacion: null }
        : []
    const query = createSupabaseQueryMock({
      data,
      error: table === failedTable ? { message: 'private detail' } : null,
    })
    queries.set(table, query)
    return query
  })
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<
    ReturnType<typeof createClient>
  >)
  return { from, queries }
}

describe('candidate detail read boundaries', () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([0, -1, 1.5, NaN])('rejects invalid id %s before access', async (id) => {
    expect(await getCandidateDetail(id)).toMatchObject({ ok: false, notFound: true })
    expect(requirePermission).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })
  it('returns not found for a missing or invisible candidate', async () => {
    const { from } = setup(undefined, true)
    expect(await getCandidateDetail(8)).toMatchObject({ ok: false, notFound: true })
    expect(from).not.toHaveBeenCalledWith('sgrh_postulacion_puntajes')
  })
  it.each(['sgrh_candidatos', 'sgrh_candidato_documentos', 'sgrh_postulaciones'])(
    'does not turn %s query failure into a successful empty record',
    async (table) => {
      setup(table)
      const result = await getCandidateDetail(8)
      expect(result.ok).toBe(false)
      expect(JSON.stringify(result)).not.toContain('private detail')
    }
  )
  it('scopes each direct read to the candidate and skips dependent queries without applications', async () => {
    const { from, queries } = setup()
    expect(await getCandidateDetail(8)).toMatchObject({
      ok: true,
      data: { cdt_id: 8, documentos: [], postulaciones: [], tipoIdentificacionNombre: '—' },
    })
    expect(requirePermission).toHaveBeenCalledWith('RECLUTAMIENTO_READ')
    expect(queries.get('sgrh_candidatos')!.eq).toHaveBeenCalledWith('cdt_id', 8)
    expect(queries.get('sgrh_candidato_documentos')!.eq).toHaveBeenCalledWith('cdo_candidato_id', 8)
    expect(queries.get('sgrh_postulaciones')!.eq).toHaveBeenCalledWith('pos_candidato_id', 8)
    expect(from).toHaveBeenCalledTimes(3)
  })
})
