import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { updateUserAssignment } from './updateUserAssignment'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseAdminClientMock, createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const INPUT = { rol_id: 4, sucursal_id: 2, empleado_id: 10 }

const UER_OK = { data: { uer_id: 55 }, error: null }
const SUCURSAL_OK = { data: { suc_id: 2 }, error: null }

function mockAdmin(responses: Parameters<typeof createSupabaseAdminClientMock>[0]) {
  const admin = createSupabaseAdminClientMock(responses)
  mockCreateAdminClient.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return admin
}

function mockSession(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('updateUserAssignment (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
    mockSession({ sgrh_empleados: { data: { emp_id: 10 }, error: null } })
  })

  it('rechaza ids inválidos sin tocar permisos', async () => {
    const result = await updateUserAssignment(0, INPUT)

    expect(result).toEqual({ ok: false, error: 'Usuario no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza input inválido antes de tocar la DB', async () => {
    const result = await updateUserAssignment(7, { ...INPUT, rol_id: -1 })

    expect(result).toEqual({ ok: false, error: 'Datos de la asignación inválidos.' })
    expect(mockCreateAdminClient).not.toHaveBeenCalled()
  })

  it('exige USUARIOS_WRITE', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: null, error: null },
    })

    await updateUserAssignment(7, INPUT)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })

  it('rechaza usuarios sin asignación en la empresa del JWT (cross-tenant)', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: { data: null, error: null },
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({ ok: false, error: 'Usuario no encontrado.' })
    expect(admin.from).toHaveBeenCalledTimes(1)
  })

  it('rechaza una sucursal de otra empresa', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_sucursales: { data: null, error: null },
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'La sucursal seleccionada no es válida para tu empresa.',
    })
  })

  it('rechaza un empleado que RLS no deja ver (otra empresa)', async () => {
    mockSession({ sgrh_empleados: { data: null, error: null } })
    mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_sucursales: SUCURSAL_OK,
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'El empleado seleccionado no es válido para tu empresa.',
    })
  })

  it('rechaza un empleado vinculado a OTRO usuario', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: { usr_id: 99 }, error: null },
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({ ok: false, error: 'Ese empleado ya está vinculado a otro usuario.' })

    // El chequeo excluye al propio usuario para permitir guardar sin cambios.
    const dupBuilder = admin.from.mock.results[2].value
    expect(dupBuilder.neq).toHaveBeenCalledWith('usr_id', 7)
  })

  it('actualiza la fila uer existente y el vínculo del empleado', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: null, error: null },
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({ ok: true })

    // from(): uer (read), sucursales, usuarios (dup), uer (update), usuarios (update)
    const uerUpdateBuilder = admin.from.mock.results[3].value
    expect(uerUpdateBuilder.update).toHaveBeenCalledWith({ uer_rol_id: 4, uer_sucursal_id: 2 })
    expect(uerUpdateBuilder.eq).toHaveBeenCalledWith('uer_id', 55)
    expect(uerUpdateBuilder.insert).not.toHaveBeenCalled()

    const usrUpdateBuilder = admin.from.mock.results[4].value
    expect(usrUpdateBuilder.update).toHaveBeenCalledWith({ usr_empleado_id: 10 })
    expect(usrUpdateBuilder.eq).toHaveBeenCalledWith('usr_id', 7)

    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })

  it('permite desvincular al empleado (empleado_id null)', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_usuarios: { data: null, error: null },
    })

    const result = await updateUserAssignment(7, { rol_id: 4 })

    expect(result).toEqual({ ok: true })
    expect(mockCreateClient).not.toHaveBeenCalled()

    // from(): uer (read), uer (update), usuarios (update)
    const usrUpdateBuilder = admin.from.mock.results[2].value
    expect(usrUpdateBuilder.update).toHaveBeenCalledWith({ usr_empleado_id: null })
  })

  it('devuelve error si el update de la asignación falla', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_OK, { data: null, error: { message: 'boom' } }],
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: null, error: null },
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar la asignación del usuario.' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('avisa si el rol se guardó pero el vínculo falló', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: [
        { data: null, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'El rol se actualizó, pero no se pudo actualizar el vínculo con el empleado.',
    })
  })
})
