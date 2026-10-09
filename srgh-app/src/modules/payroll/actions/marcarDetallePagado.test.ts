import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marcarDetallePagado } from './marcarDetallePagado'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
// La lectura de marcas se mockea entera: acá se prueba la decisión de la
// acción, no el cálculo de horas (que tiene sus propios tests).
vi.mock('@/modules/payroll/lib/horasPeriodoData', () => ({ getHorasDelPeriodo: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockGetHorasDelPeriodo = vi.mocked(getHorasDelPeriodo)

const OK = { data: null, error: null }
/** El UPDATE de ndt_pagado (solo si sigue en el estado leído) devuelve la fila. */
const ACTUALIZADA = { data: [{ ndt_id: 1 }], error: null }

const DETALLE_BASE = {
  ndt_id: 1,
  ndt_nomina_periodo_id: 9,
  ndt_historial_laboral_id: 77,
  ndt_salario_bruto: 1200000,
  sgrh_nomina_periodo: {
    npe_periodo_mes: 6,
    npe_periodo_anio: 2026,
    npe_quincena: 1,
    npe_fecha_inicio_periodo: '2026-06-01',
    npe_fecha_fin_periodo: '2026-06-15',
  },
}

const SIN_PROBLEMAS = {
  horasEsperadas: 88,
  horasOrdinarias: 88,
  horasExtra: 0,
  diasConProblema: [],
  diasQueBloquean: [],
  horasAcreditadas: 0,
  diasAcreditadosSinHorario: 0,
  diasJustificados: 0,
  periodoCubiertoPorAusencias: false,
  horasProgramadasTotales: 88,
  diasJustificadosSinHorario: 0,
  diasSinProgramar: 0,
  dias: [],
}

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock({
    // Sin comprobante previo: la acción emite uno al marcar el pago. Los
    // tests que quieran otro escenario lo declaran ellos.
    sgrh_comprobantes_pago: { data: null, error: null },
    // Verificación del BASE contra la asistencia. Por defecto no hay nada que
    // verificar (contrato sin salario): cada test que quiera probarla la
    // declara.
    sgrh_nomina_linea_ingreso: { data: [], error: null },
    sgrh_historial_laboral: {
      data: { lab_salario_base: 0, sgrh_cat_tipos_jornada: null },
      error: null,
    },
    // Sin liquidación: el contrato sigue activo.
    sgrh_liquidaciones: { data: null, error: null },
    // Aguinaldo del ciclo sin pagar: desmarcar está permitido.
    sgrh_pagos_extraordinarios: { data: [], error: null },
    ...responses,
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('marcarDetallePagado (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
    // Por defecto las marcas están completas; cada test que quiera lo contrario
    // lo declara.
    mockGetHorasDelPeriodo.mockResolvedValue({ ok: true, data: new Map([[77, SIN_PROBLEMAS]]) })
  })

  it('rechaza un ndtId inválido sin llamar a Supabase', async () => {
    const result = await marcarDetallePagado(0, true)

    expect(result).toEqual({ ok: false, error: 'Detalle inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el detalle no existe', async () => {
    mockSupabase({ sgrh_nomina_detalle: { data: null, error: null } })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: false, error: 'El detalle no existe o no es visible.' })
  })

  it('devuelve error genérico si falla el update', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el estado de pago.' })
  })

  it('marca como pagado y crea la provisión de aguinaldo (no existía fila del año)', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        ACTUALIZADA,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('sgrh_provisiones_anuales')
  })

  it('desmarca un pago y resta de una provisión existente', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: true }, error: null },
        ACTUALIZADA,
        { data: [{ ndt_pagado: false, ndt_fecha_pago: null }], error: null },
      ],
      sgrh_provisiones_anuales: [
        // 1.ª: ¿el aguinaldo del ciclo ya se pagó (botón viejo)? No.
        { data: [], error: null },
        { data: { pra_id: 5, pra_monto_acumulado_aguinaldo: 300000 }, error: null },
        OK,
      ],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, false)

    expect(result).toEqual({ ok: true })
  })

  describe('desmarcar una quincena ya usada en otro pago', () => {
    const CONTRATOS = [
      { data: { lab_empleado_id: 500 }, error: null },
      { data: [{ lab_id: 77 }, { lab_id: 76 }], error: null },
    ]
    const PAGADA = { data: { ...DETALLE_BASE, ndt_pagado: true }, error: null }

    /** ¿Se escribió la fila (el UPDATE de ndt_pagado)? */
    function seActualizoLaFila(client: ReturnType<typeof mockSupabase>) {
      return client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_detalle')
        .some(
          (r) =>
            (r.value as { update: { mock: { calls: unknown[] } } }).update.mock.calls.length > 0
        )
    }

    it('no deja desmarcar si el aguinaldo del ciclo ya se pagó', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: PAGADA,
        sgrh_historial_laboral: CONTRATOS,
        sgrh_pagos_extraordinarios: { data: [{ pex_id: 3 }], error: null },
        sgrh_provisiones_anuales: { data: [], error: null },
        sgrh_liquidaciones: { data: [], error: null },
      })

      const result = await marcarDetallePagado(1, false)

      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toContain(
          'el aguinaldo 2026 (dic 2025 – nov 2026) de este empleado ya se pagó'
        )
      expect(seActualizoLaFila(client)).toBe(false)
      // Busca en todos los contratos del empleado (un traslado paga el aguinaldo en el último).
      const pagos = client.from.mock.results[
        client.from.mock.calls.findIndex((c) => c[0] === 'sgrh_pagos_extraordinarios')
      ].value as { in: { mock: { calls: unknown[][] } }; eq: { mock: { calls: unknown[][] } } }
      expect(pagos.in.mock.calls[0]).toEqual(['pex_historial_laboral_id', [77, 76]])
      expect(pagos.eq.mock.calls).toContainEqual(['pex_anio_aguinaldo', 2026])
    })

    // Auditoría, hallazgo 2: la marca del botón anterior (sin comprobante) ya
    // no bloquea. Ni siquiera se consulta.
    it('la marca de aguinaldo del botón anterior ya no bloquea desmarcar', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: [PAGADA, ACTUALIZADA, { data: [], error: null }],
        sgrh_historial_laboral: CONTRATOS,
        sgrh_provisiones_anuales: { data: [{ pra_id: 9 }], error: null },
        sgrh_liquidaciones: { data: [], error: null },
        sgrh_nomina_periodo: OK,
      })

      const result = await marcarDetallePagado(1, false)

      expect(result).toEqual({ ok: true })
      const provisiones = client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_provisiones_anuales')
        .map((r) => r.value as { eq: { mock: { calls: unknown[][] } } })
      expect(
        provisiones.some((b) => b.eq.mock.calls.some((c) => c[0] === 'pra_aguinaldo_pagado'))
      ).toBe(false)
    })

    it('no deja desmarcar si una liquidación posterior usó la quincena', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: PAGADA,
        sgrh_historial_laboral: CONTRATOS,
        sgrh_provisiones_anuales: { data: [], error: null },
        sgrh_liquidaciones: { data: [{ liq_id: 12 }], error: null },
      })

      const result = await marcarDetallePagado(1, false)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('liquidación n.° 12')
      expect(seActualizoLaFila(client)).toBe(false)
      const liq = client.from.mock.results[
        client.from.mock.calls.findIndex((c) => c[0] === 'sgrh_liquidaciones')
      ].value as { gte: { mock: { calls: unknown[][] } } }
      // Solo cuentan las salidas desde el inicio de esta quincena.
      expect(liq.gte.mock.calls).toContainEqual(['liq_fecha_salida', '2026-06-01'])
    })

    it('una quincena de diciembre es del aguinaldo del año siguiente', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: {
          data: {
            ...DETALLE_BASE,
            ndt_pagado: true,
            sgrh_nomina_periodo: {
              ...DETALLE_BASE.sgrh_nomina_periodo,
              npe_periodo_mes: 12,
              npe_fecha_inicio_periodo: '2026-12-01',
              npe_fecha_fin_periodo: '2026-12-15',
            },
          },
          error: null,
        },
        sgrh_historial_laboral: CONTRATOS,
        sgrh_pagos_extraordinarios: { data: [{ pex_id: 3 }], error: null },
        sgrh_provisiones_anuales: { data: [], error: null },
        sgrh_liquidaciones: { data: [], error: null },
      })

      const result = await marcarDetallePagado(1, false)

      expect(result.ok === false && result.error).toContain('aguinaldo 2027')
      const pagos = client.from.mock.results[
        client.from.mock.calls.findIndex((c) => c[0] === 'sgrh_pagos_extraordinarios')
      ].value as { eq: { mock: { calls: unknown[][] } } }
      expect(pagos.eq.mock.calls).toContainEqual(['pex_anio_aguinaldo', 2027])
    })

    it('si no puede verificarlo, no desmarca', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: PAGADA,
        sgrh_historial_laboral: CONTRATOS,
        sgrh_pagos_extraordinarios: { data: null, error: { message: 'boom' } },
        sgrh_provisiones_anuales: { data: [], error: null },
      })

      const result = await marcarDetallePagado(1, false)

      expect(result).toEqual({
        ok: false,
        error: 'No se pudo verificar si esta quincena ya se usó en otro pago.',
      })
      expect(seActualizoLaFila(client)).toBe(false)
    })

    it('marcar pagada una fila que ya lo está no la vuelve a escribir (no cambia la fecha)', async () => {
      const client = mockSupabase({ sgrh_nomina_detalle: PAGADA })

      const result = await marcarDetallePagado(1, true)

      expect(result).toEqual({ ok: true })
      expect(seActualizoLaFila(client)).toBe(false)
    })
  })

  describe('incapacidad congelada con el pago', () => {
    /** Lo que se mandó en el UPDATE de la fila. */
    function updateDeLaFila(client: ReturnType<typeof mockSupabase>) {
      return client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_detalle')
        .flatMap((r) => (r.value as { update: { mock: { calls: unknown[][] } } }).update.mock.calls)
        .map((c) => c[0] as Record<string, unknown>)[0]
    }

    it('al marcar el pago guarda el monto y el porcentaje de la incapacidad', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: [
          {
            data: { ...DETALLE_BASE, ndt_pagado: false, ndt_dias_incapacidad_empleador: 3 },
            error: null,
          },
          ACTUALIZADA,
          { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
        ],
        sgrh_historial_laboral: {
          data: { lab_salario_base: 400000, sgrh_cat_tipos_jornada: null },
          error: null,
        },
        sgrh_cat_tipos_ausencia: { data: { tau_porcentaje_pago_empleador: 50 }, error: null },
        sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
        sgrh_nomina_periodo: OK,
      })

      const result = await marcarDetallePagado(1, true)

      expect(result).toEqual({ ok: true })
      // 3 días × 400.000 / 30 × 50 % = 20.000
      expect(updateDeLaFila(client)).toMatchObject({
        ndt_pagado: true,
        ndt_monto_incapacidad: 20000,
        ndt_porcentaje_incapacidad: 50,
      })
    })

    it('si no puede leer el porcentaje, no marca el pago', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: {
          data: { ...DETALLE_BASE, ndt_pagado: false, ndt_dias_incapacidad_empleador: 3 },
          error: null,
        },
        sgrh_cat_tipos_ausencia: { data: null, error: { message: 'boom' } },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok).toBe(false)
      expect(updateDeLaFila(client)).toBeUndefined()
    })

    it('al desmarcar lo borra: vuelve a calcularse en vivo', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: [
          {
            data: { ...DETALLE_BASE, ndt_pagado: true, ndt_dias_incapacidad_empleador: 3 },
            error: null,
          },
          ACTUALIZADA,
          { data: [{ ndt_pagado: false, ndt_fecha_pago: null }], error: null },
        ],
        sgrh_provisiones_anuales: { data: [], error: null },
        sgrh_nomina_periodo: OK,
      })

      const result = await marcarDetallePagado(1, false)

      expect(result).toEqual({ ok: true })
      expect(updateDeLaFila(client)).toMatchObject({
        ndt_pagado: false,
        ndt_monto_incapacidad: null,
        ndt_porcentaje_incapacidad: null,
      })
    })
  })

  describe('auditoría de nómina', () => {
    /** ¿Se escribió la fila (UPDATE de ndt_pagado)? */
    function escribioLaFila(client: ReturnType<typeof mockSupabase>) {
      return client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_detalle')
        .some(
          (r) =>
            (r.value as { update: { mock: { calls: unknown[] } } }).update.mock.calls.length > 0
        )
    }

    // Hallazgo 1: la quincena de Laura corría hasta el 15/10 y se pagó el 08/10.
    it('no deja pagar una quincena que todavía no termina', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: {
          data: {
            ...DETALLE_BASE,
            ndt_pagado: false,
            sgrh_nomina_periodo: {
              npe_periodo_mes: 1,
              npe_periodo_anio: 2099,
              npe_quincena: 1,
              npe_fecha_inicio_periodo: '2099-01-01',
              npe_fecha_fin_periodo: '2099-01-15',
            },
          },
          error: null,
        },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result).toEqual({
        ok: false,
        error:
          'Esta quincena termina el 15/01/2099: se puede marcar pagada desde ese día. Antes, los días que faltan cuentan como ausencias y el pago sale incompleto.',
      })
      expect(escribioLaFila(client)).toBe(false)
    })

    // Hallazgo 3: Ivannia ingresó el 09/05/2025 y se le pagó diciembre 2024.
    it('no deja pagar una quincena anterior al ingreso del empleado', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        sgrh_historial_laboral: {
          data: { lab_fecha_inicio: '2026-07-01', lab_fecha_fin: null },
          error: null,
        },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toContain(
          'cae fuera del contrato del empleado (ingresó el 01/07/2026)'
        )
      expect(escribioLaFila(client)).toBe(false)
    })

    it('ni una posterior a su salida', async () => {
      mockSupabase({
        sgrh_nomina_detalle: { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        sgrh_historial_laboral: {
          data: { lab_fecha_inicio: '2025-01-01', lab_fecha_fin: '2026-05-31' },
          error: null,
        },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok === false && result.error).toContain('salió el 31/05/2026')
    })

    // Hallazgo 5: Rebeca, salario ₡0 y ₡21.000 de incapacidad a cargo del patrono.
    it('una fila en ₡0 con incapacidad a cargo del patrono sí se puede pagar', async () => {
      mockGetHorasDelPeriodo.mockResolvedValue({ ok: true, data: new Map() })
      const client = mockSupabase({
        sgrh_nomina_detalle: [
          {
            data: {
              ...DETALLE_BASE,
              ndt_pagado: false,
              ndt_salario_bruto: 0,
              ndt_dias_incapacidad_empleador: 3,
            },
            error: null,
          },
          ACTUALIZADA,
          { data: [], error: null },
        ],
        sgrh_historial_laboral: { data: { lab_salario_base: 420000 }, error: null },
        sgrh_cat_tipos_ausencia: { data: { tau_porcentaje_pago_empleador: 50 }, error: null },
        sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
        sgrh_nomina_periodo: OK,
      })

      const result = await marcarDetallePagado(1, true)

      expect(result).toEqual({ ok: true })
      expect(escribioLaFila(client)).toBe(true)
    })

    // Riesgo de carrera: dos clics a la vez. El segundo no encuentra la fila
    // en el estado leído y no toca comprobante ni provisión.
    it('si la fila cambió de estado mientras tanto, no emite comprobante ni suma aguinaldo', async () => {
      const client = mockSupabase({
        sgrh_nomina_detalle: [
          { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
          { data: [], error: null },
        ],
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok === false && result.error).toContain('cambió mientras tanto')
      const tablas = client.from.mock.calls.map((c) => c[0])
      expect(tablas).not.toContain('sgrh_comprobantes_pago')
      expect(tablas).not.toContain('sgrh_provisiones_anuales')
      const update = client.from.mock.results
        .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_detalle')
        .map(
          (r) =>
            r.value as {
              update: { mock: { calls: unknown[] } }
              eq: { mock: { calls: unknown[][] } }
            }
        )
        .find((b) => b.update.mock.calls.length > 0)!
      expect(update.eq.mock.calls).toContainEqual(['ndt_pagado', false])
    })
  })

  it('no toca la provisión si el estado no cambia (llamada redundante)', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: true }, error: null },
        ACTUALIZADA,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
      ],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
  })

  it('el periodo pasa a "pagado" cuando el último empleado queda marcado (todos pagados)', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        ACTUALIZADA,
        // Tras marcar este, TODOS los empleados del periodo quedan pagados.
        {
          data: [
            { ndt_pagado: true, ndt_fecha_pago: '2026-07-20' },
            { ndt_pagado: true, ndt_fecha_pago: '2026-07-28' },
          ],
          error: null,
        },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
    // La primera llamada a la tabla lee el mes y la quincena del periodo; la
    // que importa es la que actualiza el estado.
    const llamadaPeriodo = client.from.mock.results.find(
      (r, i) =>
        client.from.mock.calls[i][0] === 'sgrh_nomina_periodo' &&
        (r.value as { update: { mock: { calls: unknown[] } } }).update.mock.calls.length > 0
    )
    expect(llamadaPeriodo?.value.update).toHaveBeenCalledWith({
      npe_estado: 'pagado',
      npe_fecha_pago: '2026-07-28', // la más reciente entre los dos empleados
    })
  })

  it('el periodo se queda en "borrador" si todavía falta pagarle a otro empleado', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        ACTUALIZADA,
        // Este empleado ya quedó pagado, pero otro del mismo periodo no.
        {
          data: [
            { ndt_pagado: true, ndt_fecha_pago: '2026-07-28' },
            { ndt_pagado: false, ndt_fecha_pago: null },
          ],
          error: null,
        },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
    // La primera llamada a la tabla lee el mes y la quincena del periodo; la
    // que importa es la que actualiza el estado.
    const llamadaPeriodo = client.from.mock.results.find(
      (r, i) =>
        client.from.mock.calls[i][0] === 'sgrh_nomina_periodo' &&
        (r.value as { update: { mock: { calls: unknown[] } } }).update.mock.calls.length > 0
    )
    expect(llamadaPeriodo?.value.update).toHaveBeenCalledWith({
      npe_estado: 'borrador',
      npe_fecha_pago: null,
    })
  })
  // La fila impaga de alguien ya liquidado no se puede pagar por planilla
  // (va en la liquidación): no puede dejar el periodo abierto para siempre.
  it('una fila impaga que ya paga una liquidación no impide cerrar el periodo', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        ACTUALIZADA,
        {
          data: [
            { ndt_historial_laboral_id: 77, ndt_pagado: true, ndt_fecha_pago: '2026-06-20' },
            { ndt_historial_laboral_id: 88, ndt_pagado: false, ndt_fecha_pago: null },
          ],
          error: null,
        },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: [
        { data: { npe_periodo_anio: 2026, npe_periodo_mes: 6, npe_quincena: 1 }, error: null },
        OK,
      ],
      sgrh_historial_laboral: [
        // marcarDetallePagado: ¿este contrato (77) ya fue liquidado? No.
        { data: [{ lab_id: 77, lab_empleado_id: 1, lab_fecha_inicio: '2020-01-01' }], error: null },
        // Lo mismo para el 88 al recalcular el periodo, y la verificación del BASE.
        { data: [{ lab_id: 88, lab_empleado_id: 2, lab_fecha_inicio: '2020-01-01' }], error: null },
      ],
      sgrh_liquidaciones: [
        { data: [], error: null },
        { data: [], error: null },
        {
          data: [
            {
              liq_id: 40,
              liq_historial_laboral_id: 88,
              liq_fecha_salida: '2026-06-10',
              liq_dias_trabajados_mes: 10,
              sgrh_historial_laboral: { lab_empleado_id: 2 },
            },
          ],
          error: null,
        },
      ],
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
    const llamadaPeriodo = client.from.mock.results.find(
      (r, i) =>
        client.from.mock.calls[i][0] === 'sgrh_nomina_periodo' &&
        (r.value as { update: { mock: { calls: unknown[] } } }).update.mock.calls.length > 0
    )
    expect(llamadaPeriodo?.value.update).toHaveBeenCalledWith({
      npe_estado: 'pagado',
      npe_fecha_pago: '2026-06-20',
    })
  })

  // sgrh_comprobantes_pago existia desde el baseline —con indice unico, RLS y
  // columna de confirmacion del empleado— pero ningun archivo la escribia: no
  // quedaba evidencia de que el pago se hizo.
  it('emite el comprobante de pago al marcar pagado', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        ACTUALIZADA,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })

    const comprobante = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === 'sgrh_comprobantes_pago'
    )
    expect(comprobante).toBeDefined()

    const inserciones = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_comprobantes_pago')
      .flatMap((r) => {
        const insert = r.value.insert as { mock: { calls: unknown[][] } }
        return insert.mock.calls.map((args) => args[0] as Record<string, unknown>)
      })

    expect(inserciones).toHaveLength(1)
    expect(inserciones[0].com_nomina_detalle_id).toBe(1)
    expect(inserciones[0].com_codigo_verificacion).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('retira el comprobante al desmarcar el pago (el pago no ocurrio)', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: true }, error: null },
        ACTUALIZADA,
        { data: [{ ndt_pagado: false, ndt_fecha_pago: null }], error: null },
      ],
      sgrh_provisiones_anuales: [
        // 1.ª: ¿el aguinaldo del ciclo ya se pagó (botón viejo)? No.
        { data: [], error: null },
        { data: { pra_id: 3, pra_monto_acumulado_aguinaldo: 50000 }, error: null },
        OK,
      ],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, false)

    expect(result).toEqual({ ok: true })

    const comprobante = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === 'sgrh_comprobantes_pago'
    )
    expect(comprobante?.value.delete).toHaveBeenCalled()
  })

  it('no emite un segundo comprobante si el detalle ya tenia uno', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        ACTUALIZADA,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
      sgrh_comprobantes_pago: { data: { com_id: 77 }, error: null },
    })

    await marcarDetallePagado(1, true)

    const inserciones = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_comprobantes_pago')
      .flatMap((r) => {
        const insert = r.value.insert as { mock: { calls: unknown[][] } }
        return insert.mock.calls
      })

    expect(inserciones).toHaveLength(0)
  })
  // Un dia con entrada y sin salida no suma horas, asi que el monto calculado
  // esta corto. Marcarlo pagado le paga de menos a la persona por un fallo del
  // kiosco, y cierra el periodo con el error adentro.
  it('no deja marcar el pago si el empleado tiene marcas incompletas', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({
      ok: true,
      data: new Map([
        [
          77,
          {
            ...SIN_PROBLEMAS,
            diasConProblema: [{ fecha: '2026-06-03', problema: 'sin_salida' as const }],
            diasQueBloquean: [{ fecha: '2026-06-03', problema: 'sin_salida' as const }],
          },
        ],
      ]),
    })

    const client = mockSupabase({
      sgrh_nomina_detalle: { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
    })

    const result = await marcarDetallePagado(1, true)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('marcas de asistencia incompletas')
      expect(result.error).toContain('no de salida')
    }
    // Y no escribió nada: ni el detalle, ni el comprobante.
    const detalle = client.from.mock.results.find(
      (_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_detalle'
    )
    expect(detalle?.value.update).not.toHaveBeenCalled()
  })

  // Segundo bloqueo: alguien corrigió una marca DESPUÉS de armada la planilla,
  // así que el monto guardado ya no corresponde a lo que dice la asistencia.
  // La fila trae la foto de lo que decía cuando se calculó.
  it('no deja marcar el pago si las marcas cambiaron desde que se armó la planilla', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({
      ok: true,
      data: new Map([[77, { ...SIN_PROBLEMAS, horasOrdinarias: 90, horasExtra: 2 }]]),
    })

    const client = mockSupabase({
      sgrh_nomina_detalle: {
        data: {
          ...DETALLE_BASE,
          ndt_pagado: false,
          // Se pagó lo que decía la asistencia en su momento: 84 h.
          ndt_horas_ordinarias_diurnas: 84,
          ndt_horas_extra_al_50: 0,
          ndt_horas_asistencia: 84,
          ndt_horas_extra_asistencia: 0,
        },
        error: null,
      },
    })

    const result = await marcarDetallePagado(1, true)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('cambiaron después de armar la planilla')
      expect(result.error).toContain('84')
      expect(result.error).toContain('90')
      // El "cómo destrabarlo" tiene que nombrar lo que de verdad funciona:
      // volver a subir el MISMO archivo no recalcula nada.
      expect(result.error).toContain('Descargá de nuevo la plantilla')
    }
    const detalle = client.from.mock.results.find(
      (_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_detalle'
    )
    expect(detalle?.value.update).not.toHaveBeenCalled()
  })

  // Si alguien ya había corregido las horas a mano, la diferencia contra la
  // asistencia es deliberada: esa decisión ya se tomó y no hay nada que avisar.
  it('no bloquea cuando las horas ya estaban corregidas a mano', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({
      ok: true,
      data: new Map([[77, { ...SIN_PROBLEMAS, horasOrdinarias: 90, horasExtra: 0 }]]),
    })

    mockSupabase({
      sgrh_nomina_detalle: [
        {
          data: {
            ...DETALLE_BASE,
            ndt_pagado: false,
            // Se pagaron 88 h aunque la asistencia decía 84: alguien lo decidió.
            ndt_horas_ordinarias_diurnas: 88,
            ndt_horas_extra_al_50: 0,
            ndt_horas_asistencia: 84,
            ndt_horas_extra_asistencia: 0,
          },
          error: null,
        },
        ACTUALIZADA,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-06-16' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
  })

  // Una fila sin foto (anterior a esta función, o de un periodo sin fechas) no
  // se puede comparar contra nada: no se inventa un bloqueo.
  it('no bloquea una fila que no tiene foto de asistencia', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({
      ok: true,
      data: new Map([[77, { ...SIN_PROBLEMAS, horasOrdinarias: 90, horasExtra: 0 }]]),
    })

    mockSupabase({
      sgrh_nomina_detalle: [
        {
          data: {
            ...DETALLE_BASE,
            ndt_pagado: false,
            ndt_horas_ordinarias_diurnas: 88,
            ndt_horas_extra_al_50: 0,
            ndt_horas_asistencia: null,
            ndt_horas_extra_asistencia: null,
          },
          error: null,
        },
        ACTUALIZADA,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-06-16' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
  })

  it('desmarcar siempre se puede, aunque haya marcas incompletas', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({
      ok: true,
      data: new Map([
        [
          77,
          {
            ...SIN_PROBLEMAS,
            diasConProblema: [{ fecha: '2026-06-03', problema: 'sin_salida' as const }],
            diasQueBloquean: [{ fecha: '2026-06-03', problema: 'sin_salida' as const }],
          },
        ],
      ]),
    })

    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: true }, error: null },
        ACTUALIZADA,
        { data: [{ ndt_pagado: false, ndt_fecha_pago: null }], error: null },
      ],
      sgrh_provisiones_anuales: [
        // 1.ª: ¿el aguinaldo del ciclo ya se pagó (botón viejo)? No.
        { data: [], error: null },
        { data: { pra_id: 3, pra_monto_acumulado_aguinaldo: 50000 }, error: null },
        OK,
      ],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, false)

    expect(result).toEqual({ ok: true })
  })

  describe('empleado ya liquidado', () => {
    const DETALLE_NO_PAGADO = { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null }

    it('no deja pagar por planilla una quincena que ya va como salario pendiente', async () => {
      // Salió el 10 de junio: la 1ª de junio (este detalle) va en la liquidación.
      const client = mockSupabase({
        sgrh_nomina_detalle: DETALLE_NO_PAGADO,
        sgrh_liquidaciones: {
          data: [
            {
              liq_id: 31,
              liq_historial_laboral_id: 77,
              liq_fecha_salida: '2026-06-10',
              liq_dias_trabajados_mes: 10,
            },
          ],
          error: null,
        },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toContain('liquidación n.° 31')
      expect(client.from.mock.calls.filter((c) => c[0] === 'sgrh_nomina_detalle')).toHaveLength(1)
    })

    it('sí deja pagar una quincena anterior al mes de salida', async () => {
      mockSupabase({
        sgrh_nomina_detalle: [
          DETALLE_NO_PAGADO,
          ACTUALIZADA,
          { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-06-20' }], error: null },
        ],
        sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
        sgrh_nomina_periodo: OK,
        sgrh_liquidaciones: {
          data: [
            {
              liq_id: 31,
              liq_historial_laboral_id: 77,
              liq_fecha_salida: '2026-07-10',
              liq_dias_trabajados_mes: 10,
            },
          ],
          error: null,
        },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result).toEqual({ ok: true })
    })

    it('si la liquidación no incluyó salario pendiente, la quincena se paga por planilla', async () => {
      mockSupabase({
        sgrh_nomina_detalle: [
          DETALLE_NO_PAGADO,
          ACTUALIZADA,
          { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-06-20' }], error: null },
        ],
        sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
        sgrh_nomina_periodo: OK,
        sgrh_liquidaciones: {
          data: [
            {
              liq_id: 31,
              liq_historial_laboral_id: 77,
              liq_fecha_salida: '2026-06-10',
              liq_dias_trabajados_mes: 0,
            },
          ],
          error: null,
        },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result).toEqual({ ok: true })
    })

    // Traslado en el mes de salida: esta fila es del contrato anterior (77) y
    // la liquidación quedó en el nuevo (78), con el salario pendiente de toda
    // la relación.
    it('también la frena si la liquidación es de otro contrato del mismo empleado', async () => {
      mockSupabase({
        sgrh_nomina_detalle: DETALLE_NO_PAGADO,
        sgrh_historial_laboral: {
          data: [{ lab_id: 77, lab_empleado_id: 3, lab_fecha_inicio: '2020-01-01' }],
          error: null,
        },
        sgrh_liquidaciones: [
          { data: [], error: null },
          {
            data: [
              {
                liq_id: 32,
                liq_historial_laboral_id: 78,
                liq_fecha_salida: '2026-06-10',
                liq_dias_trabajados_mes: 10,
                sgrh_historial_laboral: { lab_empleado_id: 3 },
              },
            ],
            error: null,
          },
        ],
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('liquidación n.° 32')
    })

    it('un reingreso después de la salida no queda frenado', async () => {
      mockSupabase({
        sgrh_nomina_detalle: [
          DETALLE_NO_PAGADO,
          ACTUALIZADA,
          { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-06-20' }], error: null },
        ],
        sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
        sgrh_nomina_periodo: OK,
        sgrh_historial_laboral: [
          {
            data: [{ lab_id: 77, lab_empleado_id: 3, lab_fecha_inicio: '2026-06-12' }],
            error: null,
          },
          { data: { lab_salario_base: 0, sgrh_cat_tipos_jornada: null }, error: null },
        ],
        sgrh_liquidaciones: [
          { data: [], error: null },
          {
            data: [
              {
                liq_id: 32,
                liq_historial_laboral_id: 78,
                liq_fecha_salida: '2026-06-10',
                liq_dias_trabajados_mes: 10,
                sgrh_historial_laboral: { lab_empleado_id: 3 },
              },
            ],
            error: null,
          },
        ],
      })

      const result = await marcarDetallePagado(1, true)

      expect(result).toEqual({ ok: true })
    })

    it('si no puede verificarlo, no marca el pago', async () => {
      mockSupabase({
        sgrh_nomina_detalle: DETALLE_NO_PAGADO,
        sgrh_liquidaciones: { data: null, error: { message: 'boom' } },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result).toEqual({
        ok: false,
        error: 'No se pudo verificar si el empleado ya fue liquidado.',
      })
    })
  })

  it('si no se pueden leer las marcas no bloquea el pago', async () => {
    // La lectura de asistencia es una verificación, no la fuente del monto: si
    // falla, no puede dejar la planilla trabada.
    mockGetHorasDelPeriodo.mockResolvedValue({ ok: false, error: 'boom' })

    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        ACTUALIZADA,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-06-20' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
  })

  // Una fila en ₡0 no es un pago: es una fila a medias. Marcarla emitía un
  // comprobante con monto cero, acumulaba ₡0 de aguinaldo y podía cerrar el
  // periodo entero sin que nadie lo notara.
  it('no deja marcar como pagada una fila en ₡0', async () => {
    mockSupabase({
      sgrh_nomina_detalle: { data: { ...DETALLE_BASE, ndt_salario_bruto: 0 }, error: null },
    })

    const result = await marcarDetallePagado(10, true)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('está en ₡0')
  })

  // Desmarcar sí se puede siempre: es la salida cuando algo quedó mal.
  it('desmarcar una fila en ₡0 sigue permitido', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_salario_bruto: 0, ndt_pagado: true }, error: null },
        ACTUALIZADA,
      ],
      sgrh_provisiones_anuales: { data: null, error: null },
      sgrh_comprobantes_pago: { data: null, error: null },
      sgrh_nomina_periodo: { data: null, error: null },
    })

    const result = await marcarDetallePagado(10, false)

    expect(result.ok).toBe(true)
  })
  // Vacaciones aprobadas DESPUÉS de armar la fila: las horas trabajadas no
  // cambian, así que el bloqueo por marcas no salta, pero el salario que
  // corresponde es otro. Pagarla así era pagar media quincena por una semana
  // de vacaciones.
  describe('BASE desactualizado', () => {
    const CON_VACACIONES = {
      ...SIN_PROBLEMAS,
      horasEsperadas: 48,
      horasOrdinarias: 48,
      horasAcreditadas: 48,
      horasProgramadasTotales: 96,
      diasJustificados: 6,
    }
    const fila = {
      ...DETALLE_BASE,
      ndt_horas_ordinarias_diurnas: 48,
      ndt_horas_extra_al_50: 0,
      ndt_horas_asistencia: 48,
      ndt_horas_extra_asistencia: 0,
    }
    const contrato = {
      data: {
        lab_salario_base: 600000,
        lab_salario_real: 600000,
        sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: 48 },
      },
      error: null,
    }
    const baseDe = (monto: number) => ({
      data: [{ ing_monto: monto, sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' } }],
      error: null,
    })

    it('no deja pagar un BASE que armó el sistema con la regla vieja', async () => {
      mockGetHorasDelPeriodo.mockResolvedValue({ ok: true, data: new Map([[77, CON_VACACIONES]]) })
      mockSupabase({
        sgrh_nomina_detalle: { data: { ...fila, ndt_pagado: false }, error: null },
        // 48 de 96 h sin acreditar las vacaciones: la mitad de 300.000.
        sgrh_nomina_linea_ingreso: baseDe(150000),
        sgrh_historial_laboral: contrato,
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('Recalcular desde asistencia')
    })

    it('deja pagar un BASE corregido a mano (no es de ninguna regla del sistema)', async () => {
      mockGetHorasDelPeriodo.mockResolvedValue({ ok: true, data: new Map([[77, CON_VACACIONES]]) })
      mockSupabase({
        sgrh_nomina_detalle: [{ data: { ...fila, ndt_pagado: false }, error: null }, ACTUALIZADA],
        sgrh_nomina_linea_ingreso: baseDe(212345),
        sgrh_historial_laboral: contrato,
        sgrh_nomina_periodo: OK,
        sgrh_provisiones_anuales: OK,
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok).toBe(true)
    })

    // El ajuste ya no se digita: uno que no es el de la regla traba el pago.
    it('no deja pagar si el ajuste no es el de la regla', async () => {
      mockGetHorasDelPeriodo.mockResolvedValue({ ok: true, data: new Map([[77, CON_VACACIONES]]) })
      mockSupabase({
        sgrh_nomina_detalle: { data: { ...fila, ndt_pagado: false }, error: null },
        // Base correcto (600.000 ÷ 30 × 15) pero sin el ajuste hasta el real.
        sgrh_nomina_linea_ingreso: baseDe(300000),
        sgrh_historial_laboral: {
          data: { ...contrato.data, lab_salario_real: 645000 },
          error: null,
        },
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/₡22\D?500 de ajuste/)
    })

    it('si no puede verificar el BASE, no marca el pago', async () => {
      mockGetHorasDelPeriodo.mockResolvedValue({ ok: true, data: new Map([[77, CON_VACACIONES]]) })
      mockSupabase({
        sgrh_nomina_detalle: { data: { ...fila, ndt_pagado: false }, error: null },
        sgrh_nomina_linea_ingreso: { data: null, error: { message: 'boom' } },
        sgrh_historial_laboral: contrato,
      })

      const result = await marcarDetallePagado(1, true)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('No se pudo verificar')
    })
  })

  // Una quincena entera de incapacidad o de permiso sin goce va en ₡0 de
  // salario, y tiene que poder marcarse: si no, el periodo no se cierra nunca.
  it('deja marcar en ₡0 una quincena cubierta entera por ausencias', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({
      ok: true,
      data: new Map([
        [
          77,
          {
            ...SIN_PROBLEMAS,
            horasEsperadas: 0,
            horasOrdinarias: 0,
            diasJustificados: 15,
            periodoCubiertoPorAusencias: true,
          },
        ],
      ]),
    })
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_salario_bruto: 0, ndt_pagado: false }, error: null },
        ACTUALIZADA,
      ],
      sgrh_nomina_periodo: OK,
      sgrh_provisiones_anuales: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result.ok).toBe(true)
  })

  // Regla del negocio: tenía horario y no marcó ningún día → 0 h, ₡0. Es el
  // monto correcto, no una fila a medias, y el periodo tiene que poder cerrarse.
  it('deja marcar en ₡0 a quien tenía horario y no vino ningún día', async () => {
    mockGetHorasDelPeriodo.mockResolvedValue({
      ok: true,
      data: new Map([[77, { ...SIN_PROBLEMAS, horasOrdinarias: 0 }]]),
    })
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_salario_bruto: 0, ndt_pagado: false }, error: null },
        ACTUALIZADA,
      ],
      sgrh_nomina_periodo: OK,
      sgrh_provisiones_anuales: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result.ok).toBe(true)
  })
})
