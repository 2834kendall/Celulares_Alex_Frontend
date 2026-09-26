import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getProvisionesAguinaldo } from './getProvisionesAguinaldo'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

type Respuesta = { data: unknown; error: unknown }

/** Salario real de ₡430.000: la quincena completa vale ₡215.000. */
function contrato(labId: number, inicio: string, fin: string | null = null, liquidado = false) {
  return {
    lab_id: labId,
    lab_fecha_inicio: inicio,
    lab_fecha_fin: fin,
    lab_salario_base: 400000,
    lab_salario_real: 430000,
    sgrh_liquidaciones: liquidado ? [{ liq_id: 99 }] : [],
  }
}

function candidato(
  labId: number,
  nombre: string,
  inicio: string,
  opciones: { fin?: string | null; ingreso?: string | null; contratos?: unknown[] } = {}
) {
  const fin = opciones.fin ?? null
  return {
    ...contrato(labId, inicio, fin),
    sgrh_empleados: {
      emp_nombre: nombre,
      emp_apellido_1: 'Prueba',
      emp_apellido_2: null,
      emp_numero_identificacion: `1-000${labId}`,
      emp_fecha_ingreso_original: opciones.ingreso ?? inicio,
      sgrh_historial_laboral: opciones.contratos ?? [contrato(labId, inicio, fin)],
    },
  }
}

/** Una quincena de planilla pagada, con sus fechas como las devuelve PostgREST. */
function detalle(labId: number, anio: number, mes: number, quincena: 1 | 2, bruto = 215000) {
  const ultimo = new Date(anio, mes, 0).getDate()
  const dos = (n: number) => String(n).padStart(2, '0')
  return {
    ndt_historial_laboral_id: labId,
    ndt_salario_bruto: bruto,
    ndt_pagado: true,
    sgrh_nomina_periodo: {
      npe_periodo_mes: mes,
      npe_periodo_anio: anio,
      npe_quincena: quincena,
      npe_fecha_inicio_periodo: `${anio}-${dos(mes)}-${quincena === 1 ? '01' : '16'}`,
      npe_fecha_fin_periodo: `${anio}-${dos(mes)}-${quincena === 1 ? '15' : dos(ultimo)}`,
    },
  }
}

/** Las 24 quincenas del ciclo 2026 (dic 2025 → nov 2026) de un contrato. */
function ciclo2026(labId: number, bruto = 215000) {
  const filas = [detalle(labId, 2025, 12, 1, bruto), detalle(labId, 2025, 12, 2, bruto)]
  for (let mes = 1; mes <= 11; mes++) {
    filas.push(detalle(labId, 2026, mes, 1, bruto), detalle(labId, 2026, mes, 2, bruto))
  }
  return filas
}

function mockSupabase(responses: Record<string, Respuesta | Respuesta[]>) {
  const client = createSupabaseClientMock({
    sgrh_ausencias: { data: [], error: null },
    sgrh_pagos_extraordinarios: { data: [], error: null },
    sgrh_provisiones_anuales: { data: [], error: null },
    ...responses,
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function conPermisos(permisos: string[]) {
  mockRequirePermission.mockResolvedValue({
    app_metadata: { permisos },
  } as unknown as Awaited<ReturnType<typeof requirePermission>>)
}

describe('getProvisionesAguinaldo (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conPermisos(['NOMINA_READ', 'AUSENCIAS_READ'])
  })

  it('calcula el aguinaldo desde las quincenas pagadas: ciclo completo = un salario', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Ana', '2020-01-15')], error: null },
      sgrh_nomina_detalle: { data: ciclo2026(1), error: null },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(1)
    expect(result.data.items[0]).toMatchObject({
      historialLaboralId: 1,
      empleadoNombre: 'Ana Prueba',
      anio: 2026,
      monto: 430000,
      elegible: true,
      pagado: false,
      pagoId: null,
      quincenasSinPagar: [],
    })
    expect(result.data.puedeLeerAusencias).toBe(true)
  })

  it('la licencia de maternidad cuenta como salario (MTSS)', async () => {
    // Marzo a junio en licencia: la planilla pagó ₡0.
    const filas = ciclo2026(1).map((f) =>
      f.sgrh_nomina_periodo.npe_periodo_anio === 2026 &&
      f.sgrh_nomina_periodo.npe_periodo_mes >= 3 &&
      f.sgrh_nomina_periodo.npe_periodo_mes <= 6
        ? { ...f, ndt_salario_bruto: 0 }
        : f
    )
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Ana', '2020-01-15')], error: null },
      sgrh_nomina_detalle: { data: filas, error: null },
      sgrh_ausencias: {
        data: [
          {
            aus_historial_laboral_id: 1,
            aus_fecha_inicio: '2026-03-01',
            aus_fecha_fin: '2026-06-30',
            sgrh_cat_tipos_ausencia: {
              tau_codigo: 'INC_MAT',
              tau_requiere_documento_ccss: true,
              tau_descuenta_vacaciones: false,
            },
          },
        ],
        error: null,
      },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0].monto).toBe(430000)
    expect(result.data.items[0].maternidad).toBe(1720000)
  })

  it('una incapacidad por enfermedad no suma: solo cuenta lo pagado como salario', async () => {
    const filas = ciclo2026(1).map((f) =>
      f.sgrh_nomina_periodo.npe_periodo_anio === 2026 && f.sgrh_nomina_periodo.npe_periodo_mes === 5
        ? { ...f, ndt_salario_bruto: 0 }
        : f
    )
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Ana', '2020-01-15')], error: null },
      sgrh_nomina_detalle: { data: filas, error: null },
      sgrh_ausencias: {
        data: [
          {
            aus_historial_laboral_id: 1,
            aus_fecha_inicio: '2026-05-01',
            aus_fecha_fin: '2026-05-31',
            sgrh_cat_tipos_ausencia: {
              tau_codigo: 'INC_ENF',
              tau_requiere_documento_ccss: true,
              tau_descuenta_vacaciones: false,
            },
          },
        ],
        error: null,
      },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 22 quincenas × 215.000 ÷ 12
    expect(result.data.items[0].monto).toBe(394166.67)
  })

  it('quien entró el 16 de noviembre no tiene el mes mínimo: no le corresponde', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Beto', '2026-11-16')], error: null },
      sgrh_nomina_detalle: { data: [detalle(1, 2026, 11, 2, 215000)], error: null },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0]).toMatchObject({ elegible: false, monto: 0 })
  })

  it('quien entró el 1 de noviembre sí: llega al 30 con un mes', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Beto', '2026-11-01')], error: null },
      sgrh_nomina_detalle: {
        data: [detalle(1, 2026, 11, 1), detalle(1, 2026, 11, 2)],
        error: null,
      },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0]).toMatchObject({ elegible: true, monto: 35833.33 })
  })

  it('un aguinaldo ya pagado muestra el monto pagado y su comprobante', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Ana', '2020-01-15')], error: null },
      sgrh_nomina_detalle: { data: ciclo2026(1), error: null },
      sgrh_pagos_extraordinarios: {
        data: [
          {
            pex_id: 70,
            pex_historial_laboral_id: 1,
            pex_fecha_pago: '2026-12-10',
            pex_monto_bruto: 429000,
          },
        ],
        error: null,
      },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0]).toMatchObject({
      pagado: true,
      pagoId: 70,
      fechaPago: '2026-12-10',
      monto: 429000,
    })
  })

  it('un aguinaldo marcado con el botón viejo sale pagado, sin comprobante', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Ana', '2020-01-15')], error: null },
      sgrh_nomina_detalle: { data: ciclo2026(1), error: null },
      sgrh_provisiones_anuales: {
        data: [
          {
            pra_historial_laboral_id: 1,
            pra_aguinaldo_pagado: true,
            pra_fecha_pago_aguinaldo: '2025-12-15',
          },
        ],
        error: null,
      },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0]).toMatchObject({ pagado: true, pagoId: null })
  })

  it('un traslado en medio del ciclo es UNA fila con las quincenas de los dos contratos', async () => {
    const contratos = [contrato(7, '2020-01-15', '2026-05-31'), contrato(8, '2026-06-01')]
    const viejo = ciclo2026(7).filter(
      (f) =>
        f.sgrh_nomina_periodo.npe_periodo_anio === 2025 ||
        f.sgrh_nomina_periodo.npe_periodo_mes <= 5
    )
    const nuevo = ciclo2026(8).filter(
      (f) =>
        f.sgrh_nomina_periodo.npe_periodo_anio === 2026 &&
        f.sgrh_nomina_periodo.npe_periodo_mes >= 6
    )
    mockSupabase({
      // Los dos contratos aparecen como candidatos (el viejo salió en mayo,
      // pero la consulta real no lo traería; se incluye para probar el filtro
      // por relación).
      sgrh_historial_laboral: {
        data: [
          candidato(8, 'Caro', '2026-06-01', { ingreso: '2020-01-15', contratos }),
          candidato(7, 'Caro', '2020-01-15', { fin: '2026-05-31', contratos }),
        ],
        error: null,
      },
      sgrh_nomina_detalle: { data: [...viejo, ...nuevo], error: null },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(1)
    expect(result.data.items[0]).toMatchObject({ historialLaboralId: 8, monto: 430000 })
  })

  it('una quincena del ciclo sin pagar no entra y se nombra', async () => {
    const filas = ciclo2026(1)
    filas[23] = { ...filas[23], ndt_pagado: false }
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Ana', '2020-01-15')], error: null },
      sgrh_nomina_detalle: { data: filas, error: null },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0].quincenasSinPagar).toEqual(['Noviembre 2026 · 2ª quincena'])
    expect(result.data.items[0].monto).toBe(412083.33)
  })

  it('avisa si el usuario no puede leer ausencias', async () => {
    conPermisos(['NOMINA_READ'])
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Ana', '2020-01-15')], error: null },
      sgrh_nomina_detalle: { data: [], error: null },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.puedeLeerAusencias).toBe(false)
  })

  it('devuelve error si falla la lectura de quincenas', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Ana', '2020-01-15')], error: null },
      sgrh_nomina_detalle: { data: null, error: { message: 'boom' } },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo cargar el historial de pagos del empleado.',
    })
  })

  it('quien entró después del 30 de noviembre no aparece en ese ciclo', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: [candidato(1, 'Dani', '2026-12-03')], error: null },
      sgrh_nomina_detalle: { data: [], error: null },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toEqual([])
  })

  it('quien salió después del cierre sigue apareciendo y se le debe el ciclo completo', async () => {
    mockSupabase({
      sgrh_historial_laboral: {
        data: [candidato(1, 'Eli', '2020-01-15', { fin: '2026-12-05' })],
        error: null,
      },
      sgrh_nomina_detalle: { data: ciclo2026(1), error: null },
    })

    const result = await getProvisionesAguinaldo(2026)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0]).toMatchObject({ fechaSalida: '2026-12-05', monto: 430000 })
  })
})
