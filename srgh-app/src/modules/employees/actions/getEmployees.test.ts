import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmployees } from './getEmployees'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const EMPLEADO_BASE = {
  emp_id: 10,
  emp_nombre: 'Ana',
  emp_apellido_1: 'Mora',
  emp_apellido_2: null,
  emp_numero_identificacion: '1-1111-1111',
  emp_telefono: null,
  emp_email_personal: null,
  emp_fecha_ingreso_original: '2024-01-01',
  emp_genero: null,
  emp_nacionalidad: 'Costarricense',
}

describe('getEmployees (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('devuelve error si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await getEmployees()

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('devuelve error generico si falla la carga de empleados', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: { data: null, error: { message: 'boom' } },
        sgrh_historial_laboral: { data: [], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getEmployees()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los empleados.' })
  })

  it('devuelve error generico si falla la carga de contratos', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: { data: [EMPLEADO_BASE], error: null },
        sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getEmployees()

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron cargar los contratos vigentes.',
    })
  })

  it('mezcla empleado + contrato vigente y marca activo', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_empleados: {
          data: [EMPLEADO_BASE, { ...EMPLEADO_BASE, emp_id: 20, emp_nombre: 'Luis' }],
          error: null,
        },
        sgrh_historial_laboral: {
          data: [
            {
              lab_empleado_id: 10,
              lab_fecha_inicio: '2024-02-01',
              lab_salario_base: 500000,
              sgrh_cat_puestos: { pue_nombre: 'Cajera' },
              sgrh_sucursales: { suc_nombre: 'Central' },
              sgrh_cat_tipos_contrato: { tco_nombre: 'Indefinido' },
            },
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getEmployees()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toMatchObject({
      emp_id: 10,
      puesto_nombre: 'Cajera',
      sucursal_nombre: 'Central',
      tipo_contrato_nombre: 'Indefinido',
      salario_base: 500000,
      fecha_inicio_contrato: '2024-02-01',
      activo: true,
    })
    expect(result.data[1]).toMatchObject({
      emp_id: 20,
      puesto_nombre: null,
      sucursal_nombre: null,
      tipo_contrato_nombre: null,
      salario_base: null,
      fecha_inicio_contrato: null,
      activo: false,
    })
  })
})
