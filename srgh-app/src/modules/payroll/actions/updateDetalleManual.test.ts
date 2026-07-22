import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateDetalleManual } from './updateDetalleManual'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { EditarDetalleInput } from '@/modules/payroll/types'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const INPUT: EditarDetalleInput = {
  montos: { BASE: 200000, COMISION: 30000 },
  horasTrabajadas: 80,
  salarioPorHora: 2500,
}

const CONCEPTOS_ACTIVOS = [
  { con_id: 1, con_codigo: 'BASE', con_tipo_calculo: 'monto_manual_ingreso', con_porcentaje: null },
  {
    con_id: 3,
    con_codigo: 'COMISION',
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
  {
    con_id: 4,
    con_codigo: 'HORAS_EXTRA',
    con_tipo_calculo: 'horas_extra_automatico',
    con_porcentaje: 150,
  },
  {
    con_id: 6,
    con_codigo: 'CCSS_OBRERA',
    con_tipo_calculo: 'porcentaje_deduccion_bruto',
    con_porcentaje: 10.83,
  },
]

const OK = { data: null, error: null }

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock(responses) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('updateDetalleManual (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un ndtId inválido sin llamar a Supabase', async () => {
    const result = await updateDetalleManual(0, INPUT)

    expect(result).toEqual({ ok: false, error: 'Detalle inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza montos negativos', async () => {
    const result = await updateDetalleManual(1, {
      ...INPUT,
      montos: { ...INPUT.montos, COMISION: -100 },
    })

    expect(result).toEqual({ ok: false, error: 'Datos inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el detalle no existe', async () => {
    mockSupabase({ sgrh_nomina_detalle: { data: null, error: null } })

    const result = await updateDetalleManual(1, INPUT)

    expect(result).toEqual({ ok: false, error: 'El detalle no existe o no es visible.' })
  })

  it('rechaza si el periodo ya no está en borrador', async () => {
    mockSupabase({
      sgrh_nomina_detalle: {
        data: {
          ndt_id: 1,
          ndt_nomina_periodo_id: 9,
          sgrh_nomina_periodo: { npe_estado: 'aprobado' },
        },
        error: null,
      },
    })

    const result = await updateDetalleManual(1, INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Solo se puede editar la planilla mientras el periodo está en borrador.',
    })
  })

  it('avisa si no hay conceptos activos en el catálogo', async () => {
    mockSupabase({
      sgrh_nomina_detalle: {
        data: {
          ndt_id: 1,
          ndt_nomina_periodo_id: 9,
          sgrh_nomina_periodo: { npe_estado: 'borrador' },
        },
        error: null,
      },
      sgrh_cat_conceptos_nomina: { data: [], error: null },
    })

    const result = await updateDetalleManual(1, INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Conceptos de nómina')
    }
  })

  it('actualiza los montos y reemplaza las líneas de ingreso y deducción', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        {
          data: {
            ndt_id: 1,
            ndt_nomina_periodo_id: 9,
            sgrh_nomina_periodo: { npe_estado: 'borrador' },
          },
          error: null,
        },
        OK,
      ],
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS_ACTIVOS, error: null },
      sgrh_nomina_linea_ingreso: [OK, OK],
      sgrh_nomina_linea_deduccion: [OK, OK],
    })

    const result = await updateDetalleManual(1, INPUT)

    expect(result).toEqual({ ok: true })
  })
})
