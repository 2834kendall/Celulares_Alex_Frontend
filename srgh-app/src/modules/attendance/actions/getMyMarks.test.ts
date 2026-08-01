import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyMarks } from './getMyMarks'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseQueryMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function mockClient(
  claims: Record<string, unknown> | null,
  marksResult: { data: unknown; error: unknown } = { data: [], error: null }
) {
  mockCreateClient.mockResolvedValue({
    auth: {
      getClaims: vi
        .fn()
        .mockResolvedValue(
          claims ? { data: { claims }, error: null } : { data: null, error: null }
        ),
    },
    from: vi.fn(() => createSupabaseQueryMock(marksResult)),
  } as unknown as SupabaseServerClient)
}

const DATE = '2026-07-25'

describe('getMyMarks (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falla si no hay sesion valida', async () => {
    mockClient(null)

    const result = await getMyMarks()

    expect(result).toEqual({ ok: false, error: 'No se pudo verificar tu sesion.' })
  })

  it('devuelve vacio si el usuario no tiene empleado ligado', async () => {
    mockClient({ app_metadata: { emp_id: null } })

    const result = await getMyMarks()

    expect(result).toEqual({ ok: true, data: [] })
  })

  it('devuelve error generico si falla la consulta de marcas', async () => {
    mockClient({ app_metadata: { emp_id: 10 } }, { data: null, error: { message: 'boom' } })

    const result = await getMyMarks()

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar tu historial de marcas.' })
  })

  it('agrupa las marcas por dia, mas reciente primero', async () => {
    mockClient(
      { app_metadata: { emp_id: 10 } },
      {
        data: [
          { mar_id: 1, mar_tipo: 'entrada', mar_fecha_hora: `2026-07-20 08:00:00` },
          { mar_id: 2, mar_tipo: 'salida', mar_fecha_hora: `2026-07-20 17:00:00` },
          { mar_id: 3, mar_tipo: 'entrada', mar_fecha_hora: `${DATE} 08:05:00` },
        ],
        error: null,
      }
    )

    const result = await getMyMarks()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toEqual({
      date: DATE,
      entrada: { time: '08:05' },
      inicioAlmuerzo: null,
      finAlmuerzo: null,
      salida: null,
    })
    expect(result.data[1]).toEqual({
      date: '2026-07-20',
      entrada: { time: '08:00' },
      inicioAlmuerzo: null,
      finAlmuerzo: null,
      salida: { time: '17:00' },
    })
  })

  it('junta entrada y salida del mismo dia aunque vengan con "T" (formato real de Supabase)', async () => {
    // Bug real: con 'T' como separador, extraer la fecha con split(' ')[0]
    // devuelve el timestamp completo (distinto por marca, por la hora) en
    // vez de "YYYY-MM-DD" — cada marca terminaba en un "dia" separado.
    mockClient(
      { app_metadata: { emp_id: 10 } },
      {
        data: [
          { mar_id: 1, mar_tipo: 'entrada', mar_fecha_hora: '2026-07-20T08:00:00' },
          { mar_id: 2, mar_tipo: 'salida', mar_fecha_hora: '2026-07-20T17:00:00' },
        ],
        error: null,
      }
    )

    const result = await getMyMarks()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toEqual({
      date: '2026-07-20',
      entrada: { time: '08:00' },
      inicioAlmuerzo: null,
      finAlmuerzo: null,
      salida: { time: '17:00' },
    })
  })

  it('ignora una marca cuyo tipo no calza con el vocabulario valido', async () => {
    mockClient(
      { app_metadata: { emp_id: 10 } },
      {
        data: [{ mar_id: 1, mar_tipo: 'Entrad', mar_fecha_hora: `${DATE} 08:00:00` }],
        error: null,
      }
    )

    const result = await getMyMarks()

    expect(result).toEqual({ ok: true, data: [] })
  })
})
