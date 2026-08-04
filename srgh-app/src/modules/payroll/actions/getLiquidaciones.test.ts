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
        liq_pagado: false,
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
          pagado: false,
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
        liq_pagado: true,
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
          pagado: true,
          createdAt: '2026-07-10T08:00:00',
        },
      ],
    })
  })
})
