import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadPlanilla } from './uploadPlanilla'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { parsePlanillaWorkbook } from '@/modules/payroll/lib/planillaExcel'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { PlanillaRowInput } from '@/modules/payroll/lib/planilla'

// uploadPlanilla.ts llama a sincronizarMovimientoBancoHoras (bancoHorasAccrual.ts),
// que importa 'server-only' — revienta en jsdom si no se mockea (ver planillaExcel.test.ts).
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/modules/payroll/lib/planillaExcel', () => ({ parsePlanillaWorkbook: vi.fn() }))
vi.mock('@/modules/payroll/lib/planillaData', () => ({ getEmpleadosActivos: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockParsePlanillaWorkbook = vi.mocked(parsePlanillaWorkbook)
const mockGetEmpleadosActivos = vi.mocked(getEmpleadosActivos)

const PERIODO_BORRADOR = { npe_id: 1, npe_estado: 'borrador', npe_sucursal_id: 2 }

// Conceptos activos "base" del catálogo: un ingreso manual (BASE) y la
// deducción porcentual de CCSS — el mínimo para que la planilla calcule algo.
const CONCEPTOS = [
  {
    con_id: 1,
    con_codigo: 'BASE',
    con_nombre: 'Salario base',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
  {
    con_id: 6,
    con_codigo: 'CCSS_OBRERA',
    con_nombre: 'Rebajo CCSS',
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'porcentaje_deduccion_bruto',
    con_porcentaje: 10.83,
  },
]

function fila(
  cedula: string,
  montos: Record<string, number>,
  extra: Partial<Omit<PlanillaRowInput, 'cedula' | 'montos'>> = {}
): PlanillaRowInput {
  return { cedula, horasTrabajadas: 88, horasExtra: 0, salarioPorHora: 0, ...extra, montos }
}

function buildFormData(periodoId = 1): FormData {
  const fd = new FormData()
  fd.set('periodoId', String(periodoId))
  fd.set('file', new File([new Uint8Array(10)], 'planilla.xlsx'))
  return fd
}

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock(responses) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

const OK = { data: null, error: null }

describe('uploadPlanilla (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un periodo inválido sin llamar a Supabase', async () => {
    const result = await uploadPlanilla(buildFormData(0))

    expect(result).toEqual({ ok: false, error: 'Periodo inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el periodo no existe', async () => {
    mockSupabase({ sgrh_nomina_periodo: { data: null, error: null } })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({ ok: false, error: 'El periodo no existe o no es visible.' })
  })

  it('rechaza si el periodo no está en borrador', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: { ...PERIODO_BORRADOR, npe_estado: 'pagado' }, error: null },
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: false,
      error: 'Solo se puede subir planilla a un periodo en borrador.',
    })
  })

  it('avisa si no hay conceptos activos en el catálogo, sin llegar a parsear el archivo', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: [], error: null },
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Conceptos de nómina')
    }
    expect(mockParsePlanillaWorkbook).not.toHaveBeenCalled()
  })

  it('rechaza el archivo si trae errores de formato', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
    })
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [],
      errors: [{ fila: 5, mensaje: 'El campo "BASE" no es un número válido.' }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('fila 5')
    }
  })

  it('rechaza cédulas sin contrato activo en la sucursal', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
    })
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('9-999-999', { BASE: 100000 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({ ok: true, data: [] })

    const result = await uploadPlanilla(buildFormData())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('9-999-999')
    }
  })

  it('un empleado sin cambios se deja intacto (no genera update ni insert)', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
      sgrh_nomina_detalle: {
        data: [
          {
            ndt_id: 10,
            ndt_historial_laboral_id: 55,
            ndt_horas_ordinarias_diurnas: 88,
            ndt_horas_extra_al_50: 0,
            ndt_salario_por_hora: 0,
            ndt_salario_bruto: 100000,
            ndt_total_deducciones_obreras: 10830,
            ndt_salario_neto: 89170,
          },
        ],
        error: null,
      },
      sgrh_nomina_linea_ingreso: {
        data: [
          {
            ing_nomina_detalle_id: 10,
            ing_monto: 100000,
            sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' },
          },
        ],
        error: null,
      },
      sgrh_nomina_linea_deduccion: { data: [], error: null },
    })
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('KEEP', { BASE: 100000 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [{ labId: 55, cedula: 'KEEP', nombre: 'Ana', salarioBaseMensual: 200000 }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: true,
      empleados: 1,
      nuevos: 0,
      actualizados: 0,
      sinCambios: 1,
      eliminados: 0,
    })
  })

  it('un empleado nuevo (sin planilla previa en el periodo) se inserta', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
      sgrh_nomina_detalle: [
        { data: [], error: null },
        { data: [{ ndt_id: 99, ndt_historial_laboral_id: 60 }], error: null },
      ],
      sgrh_nomina_linea_ingreso: OK,
      sgrh_nomina_linea_deduccion: OK,
      // 88 horas trabajadas (helper fila()) no supera el tope: solo un select
      // sin movimiento pendiente que crear.
      sgrh_banco_horas_movimientos: { data: null, error: null },
    })
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('NEW', { BASE: 50000 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [{ labId: 60, cedula: 'NEW', nombre: 'Nuevo', salarioBaseMensual: 100000 }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: true,
      empleados: 1,
      nuevos: 1,
      actualizados: 0,
      sinCambios: 0,
      eliminados: 0,
    })
  })

  it('un empleado con montos distintos se actualiza sin perder su ndt_id', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 20,
              ndt_historial_laboral_id: 70,
              ndt_horas_ordinarias_diurnas: 88,
              ndt_horas_extra_al_50: 0,
              ndt_salario_por_hora: 0,
              ndt_salario_bruto: 100000,
              ndt_total_deducciones_obreras: 10830,
              ndt_salario_neto: 89170,
            },
          ],
          error: null,
        },
        OK,
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [
            {
              ing_nomina_detalle_id: 20,
              ing_monto: 100000,
              sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' },
            },
          ],
          error: null,
        },
        OK,
        OK,
      ],
      sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK, OK],
      sgrh_banco_horas_movimientos: { data: null, error: null },
    })
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('CHG', { BASE: 300000 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [{ labId: 70, cedula: 'CHG', nombre: 'Cambio', salarioBaseMensual: 600000 }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: true,
      empleados: 1,
      nuevos: 0,
      actualizados: 1,
      sinCambios: 0,
      eliminados: 0,
    })
  })

  it('un cambio solo en horas trabajadas o salario por hora también cuenta como actualización', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 30,
              ndt_historial_laboral_id: 71,
              ndt_horas_ordinarias_diurnas: 88,
              ndt_horas_extra_al_50: 0,
              ndt_salario_por_hora: 0,
              ndt_salario_bruto: 100000,
              ndt_total_deducciones_obreras: 10830,
              ndt_salario_neto: 89170,
            },
          ],
          error: null,
        },
        OK,
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [
            {
              ing_nomina_detalle_id: 30,
              ing_monto: 100000,
              sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' },
            },
          ],
          error: null,
        },
        OK,
        OK,
      ],
      sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK, OK],
      // 96 horas superan el tope (88): sincronizarMovimientoBancoHoras hace un
      // select (sin movimiento previo) y luego un insert.
      sgrh_banco_horas_movimientos: [{ data: null, error: null }, OK],
    })
    // Mismo BASE, pero ahora sí se reportan horas y salario por hora (antes en 0).
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('HORAS', { BASE: 100000 }, { horasTrabajadas: 96, salarioPorHora: 2500 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [{ labId: 71, cedula: 'HORAS', nombre: 'Con Horas', salarioBaseMensual: 200000 }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: true,
      empleados: 1,
      nuevos: 0,
      actualizados: 1,
      sinCambios: 0,
      eliminados: 0,
    })
  })

  it('un empleado que salió del Excel se elimina, sin tocar a los que se quedaron', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 10,
              ndt_historial_laboral_id: 55,
              ndt_horas_ordinarias_diurnas: 88,
              ndt_horas_extra_al_50: 0,
              ndt_salario_por_hora: 0,
              ndt_salario_bruto: 100000,
              ndt_total_deducciones_obreras: 10830,
              ndt_salario_neto: 89170,
            },
            {
              ndt_id: 20,
              ndt_historial_laboral_id: 66,
              ndt_horas_ordinarias_diurnas: 88,
              ndt_horas_extra_al_50: 0,
              ndt_salario_por_hora: 0,
              ndt_salario_bruto: 100000,
              ndt_total_deducciones_obreras: 10830,
              ndt_salario_neto: 89170,
            },
          ],
          error: null,
        },
        OK,
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [
            {
              ing_nomina_detalle_id: 10,
              ing_monto: 100000,
              sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' },
            },
          ],
          error: null,
        },
        OK,
      ],
      sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK],
      sgrh_nomina_linea_patronal: OK,
    })
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('KEEP', { BASE: 100000 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [{ labId: 55, cedula: 'KEEP', nombre: 'Ana', salarioBaseMensual: 200000 }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: true,
      empleados: 1,
      nuevos: 0,
      actualizados: 0,
      sinCambios: 1,
      eliminados: 1,
    })
  })

  it('aplica conceptos del catálogo que no son los fijos históricos (ej. una deducción manual nueva)', async () => {
    const conceptosConPrestamo = [
      ...CONCEPTOS,
      {
        con_id: 9,
        con_codigo: 'PRESTAMO',
        con_nombre: 'Préstamo',
        con_afecta_base_ccss: true,
        con_tipo_calculo: 'monto_manual_deduccion',
        con_porcentaje: null,
      },
    ]

    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: conceptosConPrestamo, error: null },
      sgrh_nomina_detalle: [
        { data: [], error: null },
        { data: [{ ndt_id: 100, ndt_historial_laboral_id: 80 }], error: null },
      ],
      sgrh_nomina_linea_ingreso: OK,
      sgrh_nomina_linea_deduccion: OK,
      sgrh_banco_horas_movimientos: { data: null, error: null },
    })
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('CONPRESTAMO', { BASE: 200000, PRESTAMO: 15000 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [
        { labId: 80, cedula: 'CONPRESTAMO', nombre: 'Con Préstamo', salarioBaseMensual: 400000 },
      ],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: true,
      empleados: 1,
      nuevos: 1,
      actualizados: 0,
      sinCambios: 0,
      eliminados: 0,
    })
  })
  // Regresion: la comparacion de "sin cambios" solo miraba los campos del
  // Excel (horas, salario por hora, montos). Si entre una subida y otra
  // cambiaba el catalogo — por ejemplo se corregia el porcentaje de la CCSS
  // obrera — la fila llegaba identica, se marcaba "sin cambios" y se quedaba
  // con el monto viejo. La unica forma de forzar el recalculo era editarle
  // algo a cada empleado.
  it('recalcula una fila identica si el catálogo cambió desde el último guardado', async () => {
    const catalogoCorregido = CONCEPTOS.map((c) =>
      c.con_codigo === 'CCSS_OBRERA' ? { ...c, con_porcentaje: 10.5 } : c
    )

    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: catalogoCorregido, error: null },
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 10,
              ndt_historial_laboral_id: 55,
              ndt_horas_ordinarias_diurnas: 88,
              ndt_horas_extra_al_50: 0,
              ndt_salario_por_hora: 0,
              // Totales calculados con la CCSS vieja (10,83%).
              ndt_salario_bruto: 100000,
              ndt_total_deducciones_obreras: 10830,
              ndt_salario_neto: 89170,
            },
          ],
          error: null,
        },
        OK,
      ],
      sgrh_nomina_linea_ingreso: [
        {
          data: [
            {
              ing_nomina_detalle_id: 10,
              ing_monto: 100000,
              sgrh_cat_conceptos_nomina: { con_codigo: 'BASE' },
            },
          ],
          error: null,
        },
        OK,
        OK,
      ],
      sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK, OK],
      sgrh_banco_horas_movimientos: { data: null, error: null },
    })
    // El Excel viene con exactamente los mismos valores que ya estaban.
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('KEEP', { BASE: 100000 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [{ labId: 55, cedula: 'KEEP', nombre: 'Ana', salarioBaseMensual: 200000 }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: true,
      empleados: 1,
      nuevos: 0,
      actualizados: 1,
      sinCambios: 0,
      eliminados: 0,
    })
  })
  // Regresion: la subida borraba cualquier detalle que no viniera en el
  // archivo, sin mirar si ese empleado ya habia cobrado. Borrarlo elimina el
  // registro del pago y su comprobante.
  it('rechaza la subida si dejaría fuera a un empleado que ya tiene el pago marcado', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
      sgrh_nomina_detalle: {
        data: [
          {
            ndt_id: 20,
            ndt_historial_laboral_id: 66,
            ndt_pagado: true,
            ndt_horas_ordinarias_diurnas: 88,
            ndt_horas_extra_al_50: 0,
            ndt_salario_por_hora: 0,
            ndt_salario_bruto: 100000,
            ndt_total_deducciones_obreras: 10830,
            ndt_salario_neto: 89170,
          },
        ],
        error: null,
      },
      sgrh_nomina_linea_ingreso: { data: [], error: null },
      sgrh_nomina_linea_deduccion: { data: [], error: null },
    })
    // El Excel solo trae a Ana; Beto (que ya cobro) quedo fuera.
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [fila('KEEP', { BASE: 100000 })],
      errors: [],
    })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [
        { labId: 55, cedula: 'KEEP', nombre: 'Ana', salarioBaseMensual: 200000 },
        { labId: 66, cedula: 'OUT', nombre: 'Beto Solís', salarioBaseMensual: 200000 },
      ],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Beto Solís')
      expect(result.error).toContain('ya tienen el pago marcado')
    }
  })
})
