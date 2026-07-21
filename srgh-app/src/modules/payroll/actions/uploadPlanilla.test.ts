import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadPlanilla } from './uploadPlanilla'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { parsePlanillaWorkbook } from '@/modules/payroll/lib/planillaExcel'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { PlanillaRowInput } from '@/modules/payroll/lib/planilla'

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

const CONCEPTOS = [
  { con_id: 1, con_codigo: 'BASE' },
  { con_id: 2, con_codigo: 'FERIADO' },
  { con_id: 3, con_codigo: 'COMISION' },
  { con_id: 4, con_codigo: 'HORAS_EXTRA' },
  { con_id: 5, con_codigo: 'AJUSTE' },
  { con_id: 6, con_codigo: 'CCSS_OBRERA' },
]

const FILA_VACIA = { feriado: 0, comision: 0, horasExtra: 0, ajuste: 0 }

function fila(
  cedula: string,
  base: number,
  extra: Partial<PlanillaRowInput> = {}
): PlanillaRowInput {
  return { cedula, base, ...FILA_VACIA, ...extra }
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
      sgrh_nomina_periodo: { data: { ...PERIODO_BORRADOR, npe_estado: 'aprobado' }, error: null },
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result).toEqual({
      ok: false,
      error: 'Solo se puede subir planilla a un periodo en borrador.',
    })
  })

  it('rechaza el archivo si trae errores de formato', async () => {
    mockSupabase({ sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null } })
    mockParsePlanillaWorkbook.mockResolvedValue({
      rows: [],
      errors: [{ fila: 5, mensaje: 'El campo "base" no es un número válido.' }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('fila 5')
    }
  })

  it('rechaza cédulas sin contrato activo en la sucursal', async () => {
    mockSupabase({ sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null } })
    mockParsePlanillaWorkbook.mockResolvedValue({ rows: [fila('9-999-999', 100000)], errors: [] })
    mockGetEmpleadosActivos.mockResolvedValue({ ok: true, data: [] })

    const result = await uploadPlanilla(buildFormData())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('9-999-999')
    }
  })

  it('avisa si faltan conceptos del catálogo, apuntando a la pantalla de conceptos', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: [], error: null },
    })
    mockParsePlanillaWorkbook.mockResolvedValue({ rows: [fila('1-1111-1111', 100000)], errors: [] })
    mockGetEmpleadosActivos.mockResolvedValue({
      ok: true,
      data: [{ labId: 55, cedula: '1-1111-1111', nombre: 'Ana', salarioBaseMensual: 200000 }],
    })

    const result = await uploadPlanilla(buildFormData())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Conceptos de nómina')
    }
  })

  it('un empleado sin cambios se deja intacto (no genera update ni insert)', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
      sgrh_nomina_detalle: { data: [{ ndt_id: 10, ndt_historial_laboral_id: 55 }], error: null },
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
    })
    mockParsePlanillaWorkbook.mockResolvedValue({ rows: [fila('KEEP', 100000)], errors: [] })
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
    })
    mockParsePlanillaWorkbook.mockResolvedValue({ rows: [fila('NEW', 50000)], errors: [] })
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
        { data: [{ ndt_id: 20, ndt_historial_laboral_id: 70 }], error: null },
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
      sgrh_nomina_linea_deduccion: [OK, OK],
    })
    mockParsePlanillaWorkbook.mockResolvedValue({ rows: [fila('CHG', 300000)], errors: [] })
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

  it('un empleado que salió del Excel se elimina, sin tocar a los que se quedaron', async () => {
    mockSupabase({
      sgrh_nomina_periodo: { data: PERIODO_BORRADOR, error: null },
      sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
      sgrh_nomina_detalle: [
        {
          data: [
            { ndt_id: 10, ndt_historial_laboral_id: 55 },
            { ndt_id: 20, ndt_historial_laboral_id: 66 },
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
      sgrh_nomina_linea_deduccion: OK,
      sgrh_nomina_linea_patronal: OK,
    })
    mockParsePlanillaWorkbook.mockResolvedValue({ rows: [fila('KEEP', 100000)], errors: [] })
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
})
