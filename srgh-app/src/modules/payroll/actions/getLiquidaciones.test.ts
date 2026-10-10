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

/** Rubros guardados de una liquidación (columnas liq_*). */
const RUBROS = {
  liq_salario_diario: 16666.67,
  liq_salario_diario_vacaciones: 16000,
  liq_dias_trabajados_mes: 15,
  liq_salario_proporcional: 250000,
  liq_aguinaldo_proporcional: 187400,
  liq_dias_vacaciones_pendientes: 10,
  liq_vacaciones_pagadas: 160000,
  liq_horas_extra_banco: 40000,
  liq_dias_preaviso: 30,
  liq_preaviso: 500000,
  liq_dias_cesantia: 42,
  liq_cesantia: 700000,
  liq_deducciones_obreras: 32490,
  liq_observaciones: 'Primer aviso.\nSegundo aviso.',
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
        ...RUBROS,
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
          desglose: {
            salarioDiario: 16666.67,
            salarioDiarioVacaciones: 16000,
            diasSalarioPendiente: 15,
            salarioProporcional: 250000,
            aguinaldoProporcional: 187400,
            diasVacaciones: 10,
            vacacionesPagadas: 160000,
            horasExtraBanco: 40000,
            diasPreaviso: 30,
            preaviso: 500000,
            diasCesantia: 42,
            cesantia: 700000,
            notaPreaviso: null,
            notaCesantia: null,
            diasIndemnizacionPlazoFijo: 0,
            indemnizacionPlazoFijo: 0,
            total: 1837400,
            deduccionesObreras: 32490,
            neto: 1804910,
            advertencias: ['Primer aviso.', 'Segundo aviso.'],
          },
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
        ...RUBROS,
        liq_salario_diario_vacaciones: null,
        liq_horas_extra_banco: null,
        liq_deducciones_obreras: null,
        liq_observaciones: null,
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
          // Liquidación guardada antes de esas columnas: lo que falta no
          // inventa montos (sin neto, el neto es el bruto).
          desglose: expect.objectContaining({
            salarioDiarioVacaciones: null,
            horasExtraBanco: 0,
            deduccionesObreras: 0,
            total: 300000,
            neto: 300000,
            advertencias: [],
          }),
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

  // Auditoría 2, hallazgo 10: el 0 se explica. Con la nota guardada se usa
  // esa; en una liquidación vieja sin nota, si el motivo no genera el rubro,
  // se dice.
  it('explica por qué el preaviso o la cesantía quedaron en 0 días', async () => {
    mockSupabase([
      {
        liq_id: 2,
        liq_fecha_salida: '2026-07-15',
        liq_total: 100,
        liq_neto: 100,
        liq_pagado: false,
        liq_fecha_pago: null,
        liq_created_at: '2026-07-15T10:00:00',
        ...RUBROS,
        liq_dias_preaviso: 0,
        liq_preaviso: 0,
        liq_dias_cesantia: 0,
        liq_cesantia: 0,
        liq_nota_preaviso: 'menos de 3 meses de antigüedad (Arts. 28 y 29)',
        liq_nota_cesantia: null,
        sgrh_cat_motivos_salida: {
          mot_nombre: 'Renuncia Voluntaria',
          mot_genera_preaviso: false,
          mot_genera_cesantia: false,
        },
        sgrh_historial_laboral: null,
      },
    ])

    const result = await getLiquidaciones()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0].desglose.notaPreaviso).toBe(
        'menos de 3 meses de antigüedad (Arts. 28 y 29)'
      )
      expect(result.data[0].desglose.notaCesantia).toBe(
        'no aplica por el motivo de salida (Renuncia Voluntaria)'
      )
    }
  })
})
