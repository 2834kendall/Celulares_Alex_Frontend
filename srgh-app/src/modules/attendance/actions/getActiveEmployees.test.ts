import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveEmployees } from './getActiveEmployees'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requireAnyPermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequireAnyPermission = vi.mocked(requireAnyPermission)

/** Claims de una cuenta KIOSCO: adscrita a la sucursal 100. */
function claims(app_metadata: Record<string, unknown>) {
  return { app_metadata } as unknown as Awaited<ReturnType<typeof requireAnyPermission>>
}

describe('getActiveEmployees (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAnyPermission.mockResolvedValue(claims({ empresa_id: 1, sucursal_id: 100 }))
  })

  it('acepta tanto el permiso estrecho del kiosco como EMPLEADOS_READ', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: [], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    await getActiveEmployees()

    expect(mockRequireAnyPermission).toHaveBeenCalledWith([
      PERMISOS.ASISTENCIA_KIOSCO,
      PERMISOS.EMPLEADOS_READ,
    ])
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequireAnyPermission.mockResolvedValue(claims({}))

    const result = await getActiveEmployees()

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del kiosco.' })
  })

  it('falla si la cuenta del kiosco no tiene sucursal asignada', async () => {
    // sucursal_id null = usuario a nivel empresa. En un kiosco eso es un error
    // de configuracion: no se cae de vuelta a "toda la empresa".
    mockRequireAnyPermission.mockResolvedValue(claims({ empresa_id: 1, sucursal_id: null }))

    const result = await getActiveEmployees()

    expect(result).toEqual({
      ok: false,
      error: 'Este kiosco no tiene una sucursal asignada.',
    })
  })

  it('devuelve error generico si falla la carga del historial laboral', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getActiveEmployees()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('lista los empleados activos de la sucursal del kiosco, ordenados por nombre', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: {
          data: [
            {
              sgrh_empleados: {
                emp_id: 20,
                emp_nombre: 'Bruno',
                emp_apellido_1: 'Mora',
                emp_apellido_2: null,
                emp_fecha_nacimiento: '1985-03-10',
              },
            },
            {
              sgrh_empleados: {
                emp_id: 10,
                emp_nombre: 'Ana',
                emp_apellido_1: 'Perez',
                emp_apellido_2: null,
                emp_fecha_nacimiento: null,
              },
            },
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getActiveEmployees()

    expect(result).toEqual({
      ok: true,
      data: [
        { employeeId: 10, fullName: 'Ana Perez', birthDateISO: null },
        { employeeId: 20, fullName: 'Bruno Mora', birthDateISO: '1985-03-10' },
      ],
    })
  })
})
