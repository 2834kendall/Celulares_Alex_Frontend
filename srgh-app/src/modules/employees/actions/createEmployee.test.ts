import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { createEmployee } from './createEmployee'
import { inviteUser } from '@/modules/users/actions/inviteUser'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { OnboardingEmpleadoInput } from '@/modules/employees/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/users/actions/inviteUser', () => ({ inviteUser: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockInviteUser = vi.mocked(inviteUser)

const CLAIMS_FULL = {
  app_metadata: { empresa_id: 1, permisos: ['EMPLEADOS_WRITE', 'USUARIOS_WRITE'] },
} as unknown as Awaited<ReturnType<typeof requirePermission>>

const VALID_INPUT: OnboardingEmpleadoInput = {
  empleado: {
    emp_nombre: 'Ana',
    emp_apellido_1: 'Mora',
    emp_tipo_identificacion_id: 1,
    emp_numero_identificacion: '1-1111-1111',
    emp_fecha_ingreso_original: '2024-01-01',
    emp_nacionalidad: 'Costarricense',
  },
  contratacion: {
    lab_puesto_id: 3,
    lab_sucursal_id: 2,
    lab_tipo_contrato_id: 1,
    lab_tipo_jornada_id: 1,
    lab_fecha_inicio: '2024-02-01',
    lab_salario_base: 500000,
    lab_salario_real: 550000,
  },
}

const USUARIO = { email: 'ana@empresa.com', rol_id: 4 }

function mockRpc(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({}, { rpcResponses: { crear_empleado_completo: result } })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('createEmployee (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS_FULL)
  })

  it('rechaza input inválido antes de tocar permisos o DB', async () => {
    const result = await createEmployee({
      ...VALID_INPUT,
      empleado: { ...VALID_INPUT.empleado, emp_nombre: 'A' },
    })

    expect(result).toEqual({ ok: false, error: 'Datos del empleado inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('bloquea el paso usuario sin USUARIOS_WRITE', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['EMPLEADOS_WRITE'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await createEmployee({ ...VALID_INPUT, usuario: USUARIO })

    expect(result).toEqual({
      ok: false,
      error: 'No tienes permiso para crear usuarios del sistema.',
    })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('llama la RPC con empleado, contratación y datos de pago', async () => {
    const client = mockRpc({ data: 10, error: null })

    const result = await createEmployee({
      ...VALID_INPUT,
      datos_pago: { edp_banco_id: 3, edp_tipo_cuenta: 'AHORRO' },
    })

    expect(result).toEqual({ ok: true, empId: 10, usuarioWarning: undefined })
    expect(client.rpc).toHaveBeenCalledWith('crear_empleado_completo', {
      p_empleado: expect.objectContaining({ emp_nombre: 'Ana' }),
      p_contratacion: expect.objectContaining({ lab_puesto_id: 3 }),
      p_datos_pago: expect.objectContaining({ edp_banco_id: 3, edp_tipo_cuenta: 'AHORRO' }),
    })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })

  it('mapea el error de identificación duplicada', async () => {
    mockRpc({
      data: null,
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "sgrh_empleados_emp_numero_identificacion_key"',
      },
    })

    const result = await createEmployee(VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un empleado con ese número de identificación.',
    })
  })

  it('mapea el error de correo personal duplicado', async () => {
    mockRpc({
      data: null,
      error: {
        code: '23505',
        details: 'Key (emp_email_personal)=(ana@mail.com) already exists.',
      },
    })

    const result = await createEmployee(VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un empleado con ese correo personal.',
    })
  })

  it('mapea el rechazo de permiso de la RPC (42501)', async () => {
    mockRpc({ data: null, error: { code: '42501', message: 'Sin permiso' } })

    const result = await createEmployee(VALID_INPUT)

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para crear empleados.' })
  })

  it('devuelve error generico ante cualquier otro fallo de la RPC', async () => {
    mockRpc({ data: null, error: { code: '23503', message: 'Sucursal inexistente' } })

    const result = await createEmployee(VALID_INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo crear el empleado.' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('crea el empleado sin usuario y no invita', async () => {
    mockRpc({ data: 10, error: null })

    const result = await createEmployee(VALID_INPUT)

    expect(result).toEqual({ ok: true, empId: 10, usuarioWarning: undefined })
    expect(mockInviteUser).not.toHaveBeenCalled()
  })

  it('invita al usuario cuando viene el paso 3', async () => {
    mockInviteUser.mockResolvedValue({ ok: true, usrId: 7 })
    mockRpc({ data: 10, error: null })

    const result = await createEmployee({ ...VALID_INPUT, usuario: USUARIO })

    expect(result).toEqual({ ok: true, empId: 10, usuarioWarning: undefined })
    expect(mockInviteUser).toHaveBeenCalledWith({ ...USUARIO, empleado_id: 10 })
  })

  it('no revierte el alta si la invitación falla — devuelve warning', async () => {
    mockInviteUser.mockResolvedValue({
      ok: false,
      error: 'No se pudo enviar la invitación.',
    })
    mockRpc({ data: 10, error: null })

    const result = await createEmployee({ ...VALID_INPUT, usuario: USUARIO })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.empId).toBe(10)
    expect(result.usuarioWarning).toContain('No se pudo enviar la invitación.')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })
})
