import { beforeEach, describe, expect, it, vi } from 'vitest'
import { quitarFilaPlanilla } from './quitarFilaPlanilla'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { sincronizarEstadoPeriodo } from '@/modules/payroll/lib/estadoPeriodoData'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/modules/payroll/lib/estadoPeriodoData', () => ({
  sincronizarEstadoPeriodo: vi.fn(),
}))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockSincronizar = vi.mocked(sincronizarEstadoPeriodo)

const FILA_VACIA = {
  ndt_id: 30,
  ndt_nomina_periodo_id: 9,
  ndt_pagado: false,
  ndt_salario_bruto: 0,
  ndt_salario_neto: 0,
  ndt_horas_ordinarias_diurnas: 0,
  ndt_horas_extra_al_50: 0,
  ndt_dias_incapacidad_empleador: 0,
  sgrh_nomina_periodo: { npe_estado: 'borrador' },
}

function mockSupabase(
  fila: { data: unknown; error: unknown },
  borrado: { data: unknown; error: unknown } = { data: 1, error: null }
) {
  const client = createSupabaseClientMock(
    { sgrh_nomina_detalle: fila },
    { rpcResponses: { eliminar_filas_planilla: borrado } }
  )
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('quitarFilaPlanilla (auditoría 2, fallo 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({} as never)
  })

  it('quita la fila vacía con la función transaccional y resincroniza el periodo', async () => {
    const client = mockSupabase({ data: FILA_VACIA, error: null })

    const result = await quitarFilaPlanilla(30)

    expect(result).toEqual({ ok: true })
    expect(mockRequirePermission).toHaveBeenCalledWith('NOMINA_WRITE')
    expect(client.rpc).toHaveBeenCalledWith('eliminar_filas_planilla', { p_ndt_ids: [30] })
    expect(mockSincronizar).toHaveBeenCalledWith(client, 9)
  })

  it.each([
    ['tiene salario', { ndt_salario_bruto: 1000 }],
    ['tiene neto', { ndt_salario_neto: 500 }],
    ['tiene horas', { ndt_horas_ordinarias_diurnas: 8 }],
    ['tiene horas extra', { ndt_horas_extra_al_50: 2 }],
    ['tiene días de incapacidad del patrono', { ndt_dias_incapacidad_empleador: 3 }],
    ['ya está pagada', { ndt_pagado: true }],
  ])('no la quita si %s', async (_caso, cambio) => {
    const client = mockSupabase({ data: { ...FILA_VACIA, ...cambio }, error: null })

    const result = await quitarFilaPlanilla(30)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('sin nada que pagar')
    expect(client.rpc).not.toHaveBeenCalled()
    expect(mockSincronizar).not.toHaveBeenCalled()
  })

  it('no la quita si el periodo ya está pagado', async () => {
    const client = mockSupabase({
      data: { ...FILA_VACIA, sgrh_nomina_periodo: { npe_estado: 'pagado' } },
      error: null,
    })

    const result = await quitarFilaPlanilla(30)

    expect(result).toEqual({
      ok: false,
      error: 'Solo se pueden quitar filas de un periodo en borrador.',
    })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('fila inexistente o no visible', async () => {
    mockSupabase({ data: null, error: null })

    const result = await quitarFilaPlanilla(30)

    expect(result).toEqual({ ok: false, error: 'La fila no existe o no es visible.' })
  })

  it('id inválido: no consulta nada', async () => {
    const result = await quitarFilaPlanilla(0)

    expect(result).toEqual({ ok: false, error: 'Fila inválida.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('error de lectura', async () => {
    mockSupabase({ data: null, error: { message: 'boom' } })

    const result = await quitarFilaPlanilla(30)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar la fila.' })
  })

  it('muestra el mensaje de la función cuando rechaza (banco de horas ya pagado)', async () => {
    mockSupabase(
      { data: FILA_VACIA, error: null },
      { data: null, error: { code: '23514', message: 'Hay horas extra de estas filas…' } }
    )

    const result = await quitarFilaPlanilla(30)

    expect(result).toEqual({ ok: false, error: 'Hay horas extra de estas filas…' })
    expect(mockSincronizar).not.toHaveBeenCalled()
  })

  it('error inesperado del borrado: mensaje genérico', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSupabase(
      { data: FILA_VACIA, error: null },
      { data: null, error: { code: 'XX', message: 'x' } }
    )

    const result = await quitarFilaPlanilla(30)

    expect(result).toEqual({ ok: false, error: 'No se pudo quitar la fila.' })
  })
})
