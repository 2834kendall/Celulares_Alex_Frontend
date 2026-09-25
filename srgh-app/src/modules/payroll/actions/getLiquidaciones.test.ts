import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLiquidaciones } from './getLiquidaciones'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

function mockSupabase(data: unknown, error: unknown = null) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({
      sgrh_liquidaciones: { data, error },
    }) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('getLiquidaciones (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('devuelve error si falla la consulta', async () => {
    mockSupabase(null, { message: 'boom' })

    const result = await getLiquidaciones()

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo cargar el historial de liquidaciones.',
    })
  })

  it('devuelve una lista vacía si no hay liquidaciones', async () => {
    mockSupabase([])

    const result = await getLiquidaciones()

    expect(result).toEqual({ ok: true, data: [] })
  })

  it('mapea el nombre del empleado y el motivo de salida', async () => {
    mockSupabase([
      {
        liq_id: 1,
        liq_fecha_salida: '2026-07-15',
        liq_total: 1837400,
        liq_neto: 1804910,
        liq_pagado: false,
        liq_fecha_pago: null,
        liq_created_at: '2026-07-15T10:00:00',
        sgrh_cat_motivos_salida: { mot_nombre: 'Despido sin responsabilidad patronal' },
        sgrh_historial_laboral: {
          sgrh_empleados: {
            emp_nombre: 'Ana',
            emp_apellido_1: 'Pérez',
            emp_apellido_2: 'Vargas',
            emp_numero_identificacion: '1-2222-3333',
          },
        },
      },
    ])

    const result = await getLiquidaciones()

    expect(result).toEqual({
      ok: true,
      data: [
        {
          liqId: 1,
          empleadoNombre: 'Ana Pérez Vargas',
          empleadoCedula: '1-2222-3333',
          fechaSalida: '2026-07-15',
          motivoNombre: 'Despido sin responsabilidad patronal',
          total: 1837400,
          neto: 1804910,
          pagado: false,
          pagoId: null,
          fechaPago: null,
          createdAt: '2026-07-15T10:00:00',
        },
      ],
    })
  })

  it('usa valores por defecto si el empleado o el motivo no están disponibles', async () => {
    mockSupabase([
      {
        liq_id: 2,
        liq_fecha_salida: '2026-07-10',
        liq_total: 300000,
        liq_neto: null,
        liq_pagado: true,
        liq_fecha_pago: '2026-07-12',
        liq_created_at: '2026-07-10T08:00:00',
        sgrh_cat_motivos_salida: null,
        sgrh_historial_laboral: null,
      },
    ])

    const result = await getLiquidaciones()

    expect(result).toEqual({
      ok: true,
      data: [
        {
          liqId: 2,
          empleadoNombre: 'Empleado no disponible',
          empleadoCedula: '—',
          fechaSalida: '2026-07-10',
          motivoNombre: '—',
          total: 300000,
          neto: 300000,
          pagado: true,
          pagoId: null,
          fechaPago: '2026-07-12',
          createdAt: '2026-07-10T08:00:00',
        },
      ],
    })
  })

  // El pago con comprobante es la fuente de verdad: aunque liq_pagado no se
  // haya podido marcar, la liquidación se ve pagada y con su comprobante.
  it('una liquidación con pago registrado sale pagada y con el comprobante', async () => {
    mockSupabase([
      {
        liq_id: 3,
        liq_fecha_salida: '2026-08-31',
        liq_total: 500000,
        liq_neto: 480000,
        liq_pagado: false,
        liq_fecha_pago: null,
        liq_created_at: '2026-08-31T08:00:00',
        sgrh_cat_motivos_salida: null,
        sgrh_historial_laboral: null,
        sgrh_pagos_extraordinarios: [{ pex_id: 40, pex_fecha_pago: '2026-09-02' }],
      },
    ])

    const result = await getLiquidaciones()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0]).toMatchObject({ pagado: true, pagoId: 40, fechaPago: '2026-09-02' })
  })
})
