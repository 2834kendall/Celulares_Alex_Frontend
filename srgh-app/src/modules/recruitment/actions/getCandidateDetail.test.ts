import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCandidateDetail } from './getCandidateDetail'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseQueryMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

function setup(failedTable?: string, missing = false, rows: Record<string, unknown> = {}) {
  const queries = new Map<string, ReturnType<typeof createSupabaseQueryMock>>()
  const from = vi.fn((table: string) => {
    const data =
      rows[table] ??
      (table === 'sgrh_candidatos'
        ? missing
          ? null
          : { cdt_id: 8, cdt_nombre: 'Ana', sgrh_cat_tipos_identificacion: null }
        : [])
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

  it.each(['sgrh_postulacion_etapas', 'sgrh_postulacion_puntajes'])(
    'returns a recoverable error for failed dependent query %s',
    async (table) => {
      setup(table, false, { sgrh_postulaciones: [{ pos_id: 12 }] })
      expect((await getCandidateDetail(8)).ok).toBe(false)
    }
  )

  it('groups stage history and scores by application without mixing their records', async () => {
    const { queries } = setup(undefined, false, {
      sgrh_postulaciones: [
        {
          pos_id: 12,
          sgrh_cat_puestos: { pue_nombre: 'Ventas' },
          sgrh_cat_etapas_seleccion: { eta_id: 5, eta_nombre: 'Entrevista', eta_color: '#123456' },
        },
        { pos_id: 13 },
      ],
      sgrh_postulacion_etapas: [
        {
          pet_id: 1,
          pet_postulacion_id: 12,
          pet_etapa_id: 5,
          pet_notas: 'First',
          sgrh_cat_etapas_seleccion: { eta_nombre: 'Entrevista' },
          sgrh_usuarios: { usr_email: 'manager@example.test' },
        },
        { pet_id: 2, pet_postulacion_id: 13, pet_etapa_id: 6, pet_notas: 'Second' },
      ],
      sgrh_postulacion_puntajes: [
        {
          psc_postulacion_id: 12,
          psc_criterio_id: 7,
          psc_puntaje: 8,
          psc_no_aplica: false,
          sgrh_cat_criterios_seleccion: {
            cri_descripcion: 'Servicio',
            sgrh_cat_areas_seleccion: { are_nombre: 'Atención', are_color: '#ffffff', are_peso: 2 },
          },
        },
        { psc_postulacion_id: 13, psc_criterio_id: 8, psc_puntaje: null, psc_no_aplica: true },
      ],
    })
    const result = await getCandidateDetail(8)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.postulaciones).toHaveLength(2)
    const [first, second] = result.data.postulaciones
    expect(first).toMatchObject({
      pos_id: 12,
      puestoNombre: 'Ventas',
      etapaActual: { id: 5, nombre: 'Entrevista' },
      etapas: [{ pet_id: 1, responsableNombre: 'manager@example.test' }],
      puntajes: [
        {
          criterioId: 7,
          criterioDescripcion: 'Servicio',
          areaNombre: 'Atención',
          peso: 2,
          puntaje: 8,
        },
      ],
    })
    expect(second).toMatchObject({
      pos_id: 13,
      puestoNombre: '—',
      sucursalNombre: null,
      etapaActual: null,
      etapas: [{ pet_id: 2, etapaNombre: '—', responsableNombre: null }],
      puntajes: [
        {
          criterioId: 8,
          criterioDescripcion: '—',
          areaNombre: '—',
          color: null,
          peso: 1,
          noAplica: true,
        },
      ],
    })
    expect(queries.get('sgrh_postulacion_etapas')!.in).toHaveBeenCalledWith(
      'pet_postulacion_id',
      [12, 13]
    )
    expect(queries.get('sgrh_postulacion_puntajes')!.in).toHaveBeenCalledWith(
      'psc_postulacion_id',
      [12, 13]
    )
  })
})
