import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBancoHoras } from './getBancoHoras'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

/**
 * `porcentajeCatalogo` es lo que tiene la fila HORAS_EXTRA del catálogo: 150
 * significa que la hora extra se paga a tiempo y medio. `null` simula que la
 * fila no existe, para probar el respaldo.
 */
function mockSupabase(
  data: unknown,
  error: unknown = null,
  porcentajeCatalogo: number | null = 150
) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({
      sgrh_cat_conceptos_nomina: {
        data: porcentajeCatalogo === null ? null : { con_porcentaje: porcentajeCatalogo },
        error: null,
      },
      sgrh_banco_horas_movimientos: { data, error },
    }) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

function movimientoPendiente(over: Record<string, unknown> = {}) {
  return {
    bhm_id: 1,
    bhm_historial_laboral_id: 5,
    bhm_horas: 8,
    bhm_salario_por_hora: 2500,
    bhm_estado: 'pendiente',
    bhm_monto_pagado: null,
    bhm_fecha_resolucion: null,
    bhm_created_at: '2026-07-01T10:00:00',
    sgrh_historial_laboral: {
      sgrh_empleados: {
        emp_nombre: 'Ana',
        emp_apellido_1: 'Pérez',
        emp_apellido_2: null,
        emp_numero_identificacion: '1-2222-3333',
      },
    },
    sgrh_nomina_detalle: {
      sgrh_nomina_periodo: { npe_periodo_mes: 7, npe_periodo_anio: 2026, npe_quincena: 1 },
    },
    ...over,
  }
}

describe('getBancoHoras (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('devuelve error si falla la consulta', async () => {
    mockSupabase(null, { message: 'boom' })

    const result = await getBancoHoras()

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar el banco de horas.' })
  })

  it('separa pendientes de historial y calcula el monto sugerido', async () => {
    mockSupabase([
      {
        bhm_id: 1,
        bhm_historial_laboral_id: 5,
        bhm_horas: 8,
        bhm_salario_por_hora: 2500,
        bhm_estado: 'pendiente',
        bhm_monto_pagado: null,
        bhm_fecha_resolucion: null,
        bhm_created_at: '2026-07-01T10:00:00',
        sgrh_historial_laboral: {
          sgrh_empleados: {
            emp_nombre: 'Ana',
            emp_apellido_1: 'Pérez',
            emp_apellido_2: null,
            emp_numero_identificacion: '1-2222-3333',
          },
        },
        sgrh_nomina_detalle: {
          sgrh_nomina_periodo: { npe_periodo_mes: 7, npe_periodo_anio: 2026, npe_quincena: 1 },
        },
      },
      {
        bhm_id: 2,
        bhm_historial_laboral_id: 6,
        bhm_horas: 4,
        bhm_salario_por_hora: 3000,
        bhm_estado: 'pagado',
        bhm_monto_pagado: 18000,
        bhm_fecha_resolucion: '2026-07-15T09:00:00',
        bhm_created_at: '2026-07-01T10:00:00',
        sgrh_historial_laboral: {
          sgrh_empleados: {
            emp_nombre: 'Luis',
            emp_apellido_1: 'Solano',
            emp_apellido_2: 'Vega',
            emp_numero_identificacion: '1-4444-5555',
          },
        },
        sgrh_nomina_detalle: {
          sgrh_nomina_periodo: { npe_periodo_mes: 7, npe_periodo_anio: 2026, npe_quincena: 1 },
        },
      },
    ])

    const result = await getBancoHoras()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.pendientes).toHaveLength(1)
    expect(result.data.pendientes[0]).toMatchObject({
      id: 1,
      empleadoNombre: 'Ana Pérez',
      empleadoCedula: '1-2222-3333',
      horas: 8,
      montoSugerido: 30000, // 8 * 2500 * 1.5
      factorSugerido: 1.5,
      estado: 'pendiente',
    })

    expect(result.data.historial).toHaveLength(1)
    expect(result.data.historial[0]).toMatchObject({
      id: 2,
      empleadoNombre: 'Luis Solano Vega',
      estado: 'pagado',
      montoPagado: 18000,
    })
  })

  // El encargado edita el porcentaje de HORAS_EXTRA en el catálogo de
  // conceptos. Si la sugerencia siguiera clavada en 1.5, cambiarlo ahí no
  // serviría de nada y habría que corregir cada pago a mano.
  it('el multiplicador sugerido sale del catálogo, no de una constante', async () => {
    mockSupabase([movimientoPendiente()], null, 200)

    const result = await getBancoHoras()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.pendientes[0]).toMatchObject({
      factorSugerido: 2,
      montoSugerido: 40000, // 8 * 2500 * 2
    })
  })

  // Sin la fila en el catálogo no se puede quedar en blanco ni en cero: la ley
  // manda mínimo tiempo y medio, así que ese es el respaldo.
  it('sin fila en el catálogo cae a tiempo y medio', async () => {
    mockSupabase([movimientoPendiente()], null, null)

    const result = await getBancoHoras()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.pendientes[0]).toMatchObject({
      factorSugerido: 1.5,
      montoSugerido: 30000,
    })
  })
})
