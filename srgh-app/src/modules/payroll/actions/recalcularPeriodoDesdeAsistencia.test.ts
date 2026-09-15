import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recalcularPeriodoDesdeAsistencia } from './recalcularPeriodoDesdeAsistencia'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { refrescarHorasAsistencia } from '@/modules/payroll/actions/refrescarHorasAsistencia'

import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/modules/payroll/actions/refrescarHorasAsistencia', () => ({
  refrescarHorasAsistencia: vi.fn(),
}))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRefrescar = vi.mocked(refrescarHorasAsistencia)

function empleado(nombre: string, apellido: string) {
  return { sgrh_empleados: { emp_nombre: nombre, emp_apellido_1: apellido } }
}

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

const BORRADOR = { data: { npe_id: 7, npe_estado: 'borrador' }, error: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequirePermission.mockResolvedValue({ app_metadata: { usr_id: 1 } } as never)
})

describe('recalcularPeriodoDesdeAsistencia', () => {
  it('recalcula cada fila del periodo y cuenta las que cambiaron', async () => {
    mockSupabase({
      sgrh_nomina_periodo: BORRADOR,
      sgrh_nomina_detalle: {
        data: [
          { ndt_id: 10, ndt_pagado: false, sgrh_historial_laboral: empleado('Gabriela', 'Araya') },
          { ndt_id: 11, ndt_pagado: false, sgrh_historial_laboral: empleado('Luis', 'Mora') },
        ],
        error: null,
      },
    })
    mockRefrescar
      .mockResolvedValueOnce({
        ok: true,
        horas: 9,
        horasExtra: 3,
        sinCambios: false,
        baseConservado: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        horas: 96,
        horasExtra: 0,
        sinCambios: true,
        baseConservado: false,
      })

    const result = await recalcularPeriodoDesdeAsistencia(7)

    expect(result).toEqual({ ok: true, recalculadas: 1, yaEstaban: 1, omitidas: [] })
    expect(mockRefrescar).toHaveBeenNthCalledWith(1, 10, false)
    expect(mockRefrescar).toHaveBeenNthCalledWith(2, 11, false)
  })

  // El caso que motivó la acción: una fila con horas y ₡0 no se arregla sola
  // porque la planilla guarda montos, no fórmulas. Tiene que pasar por acá.
  it('devuelve el motivo con nombre y apellido cuando una fila no se pudo arreglar', async () => {
    mockSupabase({
      sgrh_nomina_periodo: BORRADOR,
      sgrh_nomina_detalle: {
        data: [
          { ndt_id: 10, ndt_pagado: false, sgrh_historial_laboral: empleado('Gabriela', 'Araya') },
        ],
        error: null,
      },
    })
    mockRefrescar.mockResolvedValue({
      ok: false,
      error: 'Este empleado no tiene salario base en su contrato, así que la planilla le daría ₡0.',
    })

    const result = await recalcularPeriodoDesdeAsistencia(7)

    expect(result).toEqual({
      ok: true,
      recalculadas: 0,
      yaEstaban: 0,
      omitidas: [
        {
          nombre: 'Gabriela Araya',
          motivo:
            'Este empleado no tiene salario base en su contrato, así que la planilla le daría ₡0.',
        },
      ],
    })
  })

  // Mover el monto de alguien que ya cobró dejaría su comprobante mintiendo.
  it('no toca las filas ya pagadas', async () => {
    mockSupabase({
      sgrh_nomina_periodo: BORRADOR,
      sgrh_nomina_detalle: {
        data: [
          { ndt_id: 10, ndt_pagado: true, sgrh_historial_laboral: empleado('Gabriela', 'Araya') },
        ],
        error: null,
      },
    })

    const result = await recalcularPeriodoDesdeAsistencia(7)

    expect(mockRefrescar).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: true,
      recalculadas: 0,
      omitidas: [{ nombre: 'Gabriela Araya', motivo: 'ya se le marcó el pago' }],
    })
  })

  // Una corrección a mano es una decisión de alguien. En masa no se pisa: se
  // reporta para que esa persona la confirme desde su propia fila.
  it('nunca confirma por su cuenta el reemplazo de unas horas corregidas a mano', async () => {
    mockSupabase({
      sgrh_nomina_periodo: BORRADOR,
      sgrh_nomina_detalle: {
        data: [
          { ndt_id: 10, ndt_pagado: false, sgrh_historial_laboral: empleado('Gabriela', 'Araya') },
        ],
        error: null,
      },
    })
    mockRefrescar.mockResolvedValue({
      ok: false,
      necesitaConfirmacion: true,
      error: 'Estas horas están corregidas a mano (80 h) y la asistencia dice 96 h.',
    })

    const result = await recalcularPeriodoDesdeAsistencia(7)

    expect(mockRefrescar).toHaveBeenCalledWith(10, false)
    expect(result).toMatchObject({ ok: true, recalculadas: 0 })
    expect((result as { omitidas: { nombre: string }[] }).omitidas).toHaveLength(1)
  })

  it('no recalcula un periodo que ya se cerró', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: { npe_id: 7, npe_estado: 'pagado' }, error: null },
    })

    const result = await recalcularPeriodoDesdeAsistencia(7)

    expect(result.ok).toBe(false)
    expect(mockRefrescar).not.toHaveBeenCalled()
  })

  it('avisa que hay que cargar los empleados si el periodo está vacío', async () => {
    mockSupabase({
      sgrh_nomina_periodo: BORRADOR,
      sgrh_nomina_detalle: { data: [], error: null },
    })

    const result = await recalcularPeriodoDesdeAsistencia(7)

    expect(result).toEqual({
      ok: false,
      error: 'Este periodo no tiene empleados todavía. Cargalos desde la asistencia primero.',
    })
  })

  it('rechaza un id inválido sin tocar la base', async () => {
    expect(await recalcularPeriodoDesdeAsistencia(0)).toEqual({
      ok: false,
      error: 'Periodo inválido.',
    })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
