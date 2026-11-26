import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkEmployeeIdentificacion } from './checkEmployeeIdentificacion'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockRequirePermission = vi.mocked(requirePermission)

function mockAdmin(response: { data: unknown; error: unknown }) {
  const admin = createSupabaseAdminClientMock({ sgrh_empleados: response })
  mockCreateAdminClient.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return admin
}

describe('checkEmployeeIdentificacion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza identificaciones vacías o demasiado largas antes de tocar permisos o DB', async () => {
    expect(await checkEmployeeIdentificacion('')).toEqual({
      ok: false,
      error: 'Número de identificación inválido.',
    })
    expect(await checkEmployeeIdentificacion('   ')).toEqual({
      ok: false,
      error: 'Número de identificación inválido.',
    })
    expect(await checkEmployeeIdentificacion('1'.repeat(31))).toEqual({
      ok: false,
      error: 'Número de identificación inválido.',
    })

    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateAdminClient).not.toHaveBeenCalled()
  })

  it('exige EMPLEADOS_WRITE antes de consultar la base de datos', async () => {
    mockRequirePermission.mockRejectedValue(new Error('NEXT_REDIRECT:/unauthorized'))

    await expect(checkEmployeeIdentificacion('1-1111-1111')).rejects.toThrow(
      'NEXT_REDIRECT:/unauthorized'
    )
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)
    expect(mockCreateAdminClient).not.toHaveBeenCalled()
  })

  it('devuelve disponible: true cuando no existe ningún empleado con esa identificación', async () => {
    const admin = mockAdmin({ data: null, error: null })

    const result = await checkEmployeeIdentificacion('  1-1111-1111  ')

    expect(result).toEqual({ ok: true, disponible: true })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)
    const query = admin.from.mock.results[0].value
    expect(query.eq).toHaveBeenCalledWith('emp_numero_identificacion', '1-1111-1111')
  })

  it('devuelve disponible: false cuando la identificación ya está registrada (sin exponer PII)', async () => {
    mockAdmin({ data: { emp_id: 42 }, error: null })

    const result = await checkEmployeeIdentificacion('1-1111-1111')

    expect(result).toEqual({ ok: true, disponible: false })
  })

  it('devuelve error genérico si la consulta falla', async () => {
    mockAdmin({ data: null, error: { message: 'db down' } })

    const result = await checkEmployeeIdentificacion('1-1111-1111')

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo verificar el número de identificación.',
    })
  })
})
