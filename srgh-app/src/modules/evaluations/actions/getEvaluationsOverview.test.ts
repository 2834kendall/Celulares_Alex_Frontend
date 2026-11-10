import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEvaluationsOverview } from './getEvaluationsOverview'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { signEmployeePhotos } from '@/lib/storage/employee-photos'
import { createSupabaseQueryMock } from '@/test/supabaseMock'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'

vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'No se pudo aplicar el filtro de marca.',
  getFiltroMarca: vi.fn(async () => ({ estado: 'sin-filtro', sucursalIds: null })),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requireAnyPermission: vi.fn() }))
vi.mock('@/lib/storage/employee-photos', () => ({ signEmployeePhotos: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAnyPermission).mockResolvedValue({
    app_metadata: { empresa_id: 1 },
  } as unknown as Awaited<ReturnType<typeof requireAnyPermission>>)
  vi.mocked(signEmployeePhotos).mockResolvedValue({})
})
function setup(histories: unknown[] = [], evaluations: unknown[] = [], failedTable?: string) {
  const queries = new Map<string, ReturnType<typeof createSupabaseQueryMock>>()
  const from = vi.fn((table: string) => {
    const q = createSupabaseQueryMock({
      data: table === 'sgrh_historial_laboral' ? histories : evaluations,
      error: table === failedTable ? { message: 'private detail' } : null,
    })
    queries.set(table, q)
    return q
  })
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<
    ReturnType<typeof createClient>
  >)
  return queries
}
const employee = {
  emp_nombre: 'Ana',
  emp_apellido_1: 'Perez',
  emp_apellido_2: null,
  emp_numero_identificacion: '123',
  emp_foto_path: '1/empleados/1/photo.jpg',
}
const history = {
  lab_id: 1,
  lab_empleado_id: 10,
  lab_sucursal_id: 5,
  sgrh_empleados: employee,
  sgrh_sucursales: { suc_id: 5, suc_nombre: 'Centro' },
  sgrh_cat_puestos: null,
}
const evaluation = {
  eve_id: 8,
  eve_historial_laboral_id: 1,
  eve_fecha_evaluacion: '2026-11-06',
  eve_tipo_periodo: 'trimestral',
  eve_tipo_evaluacion: 'desempeno',
  eve_promedio_final: null,
  eve_resultado_texto: null,
  eve_observaciones: null,
  sgrh_usuarios: null,
  sgrh_evaluacion_resultados: [],
}

describe('evaluation overview', () => {
  it('does not query without a company', async () => {
    vi.mocked(requireAnyPermission).mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requireAnyPermission>
    >)
    expect((await getEvaluationsOverview()).ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })
  it.each(['sgrh_historial_laboral', 'sgrh_evaluaciones'])(
    'does not present failed %s reads as a successful empty overview',
    async (table) => {
      setup([], [], table)
      expect((await getEvaluationsOverview()).ok).toBe(false)
      expect(signEmployeePhotos).not.toHaveBeenCalled()
    }
  )
  it('limits reads to the company and active contracts and returns a true empty state', async () => {
    const queries = setup()
    expect(await getEvaluationsOverview()).toEqual({ ok: true, collaborators: [], branches: [] })
    expect(requireAnyPermission).toHaveBeenCalledWith(['EVALUACIONES_READ', 'EVALUACIONES_WRITE'])
    expect(queries.get('sgrh_historial_laboral')!.eq).toHaveBeenCalledWith('lab_empresa_id', 1)
    expect(queries.get('sgrh_historial_laboral')!.is).toHaveBeenCalledWith('lab_fecha_fin', null)
    expect(queries.get('sgrh_evaluaciones')!.eq).toHaveBeenCalledWith('eve_empresa_id', 1)
    expect(queries.get('sgrh_evaluaciones')!.order).toHaveBeenCalledWith('eve_fecha_evaluacion', {
      ascending: false,
    })
    expect(queries.get('sgrh_evaluaciones')!.order).toHaveBeenCalledWith('eve_id', {
      ascending: false,
    })
  })
  it('separates each contract history, skips unassigned evaluations and excludes nonapplicable scores', async () => {
    vi.mocked(signEmployeePhotos).mockResolvedValue({
      '1/empleados/1/photo.jpg': 'https://signed.example/photo',
    })
    setup(
      [
        history,
        {
          ...history,
          lab_id: 2,
          lab_empleado_id: 11,
          sgrh_empleados: { ...employee, emp_nombre: 'Bruno', emp_foto_path: null },
        },
      ],
      [
        {
          ...evaluation,
          sgrh_evaluacion_resultados: [
            {
              evr_criterio_id: 1,
              evr_puntaje: 8.6,
              evr_no_aplica: false,
              evr_observacion: 'Buen servicio',
            },
            { evr_criterio_id: 2, evr_puntaje: 10, evr_no_aplica: true, evr_observacion: null },
          ],
          sgrh_usuarios: {
            usr_email: 'manager@example.test',
            sgrh_empleados: { emp_nombre: 'Luz', emp_apellido_1: 'Mora' },
          },
        },
        {
          ...evaluation,
          eve_id: 7,
          eve_promedio_final: 7.4,
          sgrh_usuarios: { usr_email: 'old@example.test', sgrh_empleados: null },
        },
        { ...evaluation, eve_id: 9, eve_historial_laboral_id: null },
      ]
    )
    const result = await getEvaluationsOverview()
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.branches).toEqual([{ id: 5, name: 'Centro' }])
    expect(result.collaborators[0]).toMatchObject({
      labId: 1,
      fullName: 'Ana Perez',
      fotoUrl: 'https://signed.example/photo',
      evaluation: {
        id: 8,
        promedio: 9,
        scores: { 1: 9 },
        observations: { 1: 'Buen servicio' },
        evaluador: 'Luz Mora',
      },
    })
    expect(result.collaborators[0].history.map((row) => row.id)).toEqual([8, 7])
    expect(result.collaborators[0].history[1]).toMatchObject({
      promedio: 7,
      evaluador: 'old@example.test',
    })
    expect(result.collaborators[1]).toMatchObject({
      labId: 2,
      evaluation: null,
      history: [],
      fotoUrl: null,
    })
    expect(JSON.stringify(result)).not.toContain('1/empleados/1/photo.jpg')
  })
})

const FILTRO_MARCA = { estado: 'filtrado' as const, marcaId: 1, sucursalIds: [5, 6] }
const FILTRO_ERROR = { estado: 'error', sucursalIds: null } as const

describe('evaluation overview with a chosen brand', () => {
  it('reads only the contracts of that brand', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_MARCA)
    const queries = setup([history])

    await getEvaluationsOverview()

    expect(queries.get('sgrh_historial_laboral')?.in).toHaveBeenCalledWith(
      'lab_sucursal_id',
      [5, 6]
    )
  })

  it('without a brand it does not narrow', async () => {
    const queries = setup([history])

    await getEvaluationsOverview()

    expect(queries.get('sgrh_historial_laboral')?.in).not.toHaveBeenCalled()
  })

  it('fails instead of showing everybody when the filter could not be read', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_ERROR)
    setup([history])

    expect(await getEvaluationsOverview()).toEqual({
      ok: false,
      error: 'No se pudo aplicar el filtro de marca.',
    })
    expect(createClient).not.toHaveBeenCalled()
  })
})
