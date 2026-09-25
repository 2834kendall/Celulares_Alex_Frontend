import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pagarAguinaldo } from './pagarAguinaldo'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

type Respuesta = { data: unknown; error: unknown }

const CONTRATO = {
  lab_id: 1,
  lab_fecha_inicio: '2020-01-15',
  lab_fecha_fin: null,
  lab_salario_base: 400000,
  lab_salario_real: 430000,
  sgrh_liquidaciones: [],
}

const CANDIDATO = {
  ...CONTRATO,
  sgrh_empleados: {
    emp_nombre: 'Ana',
    emp_apellido_1: 'Prueba',
    emp_apellido_2: null,
    emp_numero_identificacion: '1-0001',
    emp_fecha_ingreso_original: '2020-01-15',
    sgrh_historial_laboral: [CONTRATO],
  },
}

function detalle(anio: number, mes: number, quincena: 1 | 2, bruto = 215000, pagado = true) {
  return {
    ndt_historial_laboral_id: 1,
    ndt_salario_bruto: bruto,
    ndt_pagado: pagado,
    sgrh_nomina_periodo: {
      npe_periodo_mes: mes,
      npe_periodo_anio: anio,
      npe_quincena: quincena,
      npe_fecha_inicio_periodo: null,
      npe_fecha_fin_periodo: null,
    },
  }
}

function ciclo2026() {
  const filas = [detalle(2025, 12, 1), detalle(2025, 12, 2)]
  for (let mes = 1; mes <= 11; mes++) filas.push(detalle(2026, mes, 1), detalle(2026, mes, 2))
  return filas
}

const PAGO_OK = { data: { pex_id: 55 }, error: null }

function mockSupabase(responses: Record<string, Respuesta | Respuesta[]> = {}) {
  const client = createSupabaseClientMock({
    sgrh_historial_laboral: { data: [CANDIDATO], error: null },
    sgrh_nomina_detalle: { data: ciclo2026(), error: null },
    sgrh_ausencias: { data: [], error: null },
    // 1ª lectura: pagos del ciclo (ninguno). 2ª: el insert del pago.
    sgrh_pagos_extraordinarios: [{ data: [], error: null }, PAGO_OK],
    // 1ª: provisiones del ciclo; 2ª: la de este contrato; 3ª: el update.
    sgrh_provisiones_anuales: [
      { data: [], error: null },
      { data: { pra_id: 3 }, error: null },
      { data: null, error: null },
    ],
    ...responses,
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Lo que se le mandó al insert de la tabla, en la n-ésima llamada a from(tabla). */
function llamada(
  client: ReturnType<typeof mockSupabase>,
  tabla: string,
  metodo: 'insert' | 'update',
  n = 0
) {
  const idx = client.from.mock.calls.map((c, i) => (c[0] === tabla ? i : -1)).filter((i) => i >= 0)
  for (const i of idx) {
    const fn = (
      client.from.mock.results[i].value as Record<string, { mock: { calls: unknown[][] } }>
    )[metodo]
    if (fn.mock.calls.length > 0) {
      if (n === 0) return fn.mock.calls[0][0] as Record<string, unknown>
      n--
    }
  }
  return undefined
}

describe('pagarAguinaldo (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 10, 10, 0, 0)) // 10 de diciembre de 2026
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['NOMINA_WRITE', 'AUSENCIAS_READ'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registra el pago con el monto calculado, sin deducciones, y marca la provisión', async () => {
    const client = mockSupabase()

    const result = await pagarAguinaldo(1, 2026)

    expect(result).toEqual({ ok: true, pagoId: 55 })
    const pago = llamada(client, 'sgrh_pagos_extraordinarios', 'insert')
    expect(pago).toMatchObject({
      pex_tipo: 'aguinaldo',
      pex_historial_laboral_id: 1,
      pex_anio_aguinaldo: 2026,
      pex_liquidacion_id: null,
      pex_monto_bruto: 430000,
      pex_deducciones: 0,
      pex_monto_neto: 430000,
      pex_fecha_pago: '2026-12-10',
    })
    expect(pago?.pex_codigo_verificacion).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(llamada(client, 'sgrh_provisiones_anuales', 'update')).toEqual({
      pra_aguinaldo_pagado: true,
      pra_fecha_pago_aguinaldo: '2026-12-10',
    })
  })

  it('antes del 1 de diciembre no se deja pagar: el ciclo no ha cerrado', async () => {
    vi.setSystemTime(new Date(2026, 10, 30, 23, 0, 0)) // 30 de noviembre, 11 p. m.

    const result = await pagarAguinaldo(1, 2026)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('01/12/2026')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('con quincenas del ciclo sin pagar no paga, y las nombra', async () => {
    const filas = ciclo2026()
    filas[23] = detalle(2026, 11, 2, 215000, false)
    const client = mockSupabase({ sgrh_nomina_detalle: { data: filas, error: null } })

    const result = await pagarAguinaldo(1, 2026)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Noviembre 2026 · 2ª quincena')
    expect(llamada(client, 'sgrh_pagos_extraordinarios', 'insert')).toBeUndefined()
  })

  it('sin el mes mínimo continuo no paga', async () => {
    const nuevo = {
      ...CANDIDATO,
      lab_fecha_inicio: '2026-11-16',
      sgrh_empleados: {
        ...CANDIDATO.sgrh_empleados,
        emp_fecha_ingreso_original: '2026-11-16',
        sgrh_historial_laboral: [{ ...CONTRATO, lab_fecha_inicio: '2026-11-16' }],
      },
    }
    mockSupabase({
      sgrh_historial_laboral: { data: [nuevo], error: null },
      sgrh_nomina_detalle: { data: [detalle(2026, 11, 2)], error: null },
    })

    const result = await pagarAguinaldo(1, 2026)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('un mes laborado')
  })

  it('si ya tiene un pago de ese ciclo, no lo paga otra vez', async () => {
    mockSupabase({
      sgrh_pagos_extraordinarios: {
        data: [
          {
            pex_id: 9,
            pex_historial_laboral_id: 1,
            pex_fecha_pago: '2026-12-05',
            pex_monto_bruto: 1,
          },
        ],
        error: null,
      },
    })

    const result = await pagarAguinaldo(1, 2026)

    expect(result).toEqual({ ok: false, error: 'Este aguinaldo ya estaba pagado.' })
  })

  it('si otro usuario lo pagó al mismo tiempo (índice único), lo dice', async () => {
    mockSupabase({
      sgrh_pagos_extraordinarios: [
        { data: [], error: null },
        {
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "sgrh_pex_aguinaldo_unq"',
          },
        },
      ],
    })

    const result = await pagarAguinaldo(1, 2026)

    expect(result).toEqual({ ok: false, error: 'Este aguinaldo ya estaba pagado.' })
  })

  it('quien salió antes del cierre no aparece: su aguinaldo va en la liquidación', async () => {
    mockSupabase({ sgrh_historial_laboral: { data: [], error: null } })

    const result = await pagarAguinaldo(1, 2026)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('liquidación')
  })

  it('sin permiso de leer ausencias no paga (no vería la licencia de maternidad)', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['NOMINA_WRITE'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await pagarAguinaldo(1, 2026)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('AUSENCIAS_READ')
  })

  it('rechaza datos inválidos', async () => {
    expect((await pagarAguinaldo(0, 2026)).ok).toBe(false)
    expect((await pagarAguinaldo(1, 1999)).ok).toBe(false)
  })
})
