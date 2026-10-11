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

const INPUT = { rol_id: 4, sucursal_ids: [2], empleado_id: 10 }

// El guard cross-tenant (existe alguna fila uer del usuario en la empresa)
// y la lectura interna de syncUserSucursales pegan a la MISMA tabla, en ese
// orden: el mock consume estas respuestas en secuencia.
const UER_EXISTE = { data: { uer_id: 55 }, error: null }
const UER_SYNC_SIN_CAMBIOS = { data: [{ uer_id: 55, uer_sucursal_id: 2 }], error: null }
const OK = { data: null, error: null }
const SUCURSAL_OK = { data: [{ suc_id: 2 }], error: null }

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

function llamadasA(admin: ReturnType<typeof mockAdmin>, tabla: string) {
  return admin.from.mock.calls
    .map((call, i) => (call[0] === tabla ? admin.from.mock.results[i].value : null))
    .filter((v): v is NonNullable<typeof v> => v !== null)
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
      sgrh_usuarios_empresa_rol: [UER_EXISTE, UER_SYNC_SIN_CAMBIOS, OK],
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: OK,
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
      sgrh_usuarios_empresa_rol: UER_EXISTE,
      sgrh_sucursales: { data: [], error: null },
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
      sgrh_usuarios_empresa_rol: UER_EXISTE,
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
      sgrh_usuarios_empresa_rol: UER_EXISTE,
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: { usr_id: 99 }, error: null },
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({ ok: false, error: 'Ese empleado ya está vinculado a otro usuario.' })

    // El chequeo excluye al propio usuario para permitir guardar sin cambios.
    const dupBuilder = llamadasA(admin, 'sgrh_usuarios')[0]
    expect(dupBuilder.neq).toHaveBeenCalledWith('usr_id', 7)
  })

  it('actualiza la fila uer existente y el vínculo del empleado', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_EXISTE, UER_SYNC_SIN_CAMBIOS, OK],
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: [{ data: null, error: null }, OK],
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({ ok: true })

    // Sin cambios en el conjunto de sucursales: syncUserSucursales solo
    // actualiza el rol de la fila sobreviviente, no inserta ni borra.
    // uerCalls[0]=existencia, [1]=lectura interna, [2]=update sobreviviente
    const uerCalls = llamadasA(admin, 'sgrh_usuarios_empresa_rol')
    const uerUpdateBuilder = uerCalls[2]
    expect(uerUpdateBuilder.update).toHaveBeenCalledWith({ uer_rol_id: 4 })
    expect(uerUpdateBuilder.in).toHaveBeenCalledWith('uer_id', [55])
    expect(uerUpdateBuilder.insert).not.toHaveBeenCalled()
    expect(uerUpdateBuilder.delete).not.toHaveBeenCalled()

    const usrUpdateBuilder = llamadasA(admin, 'sgrh_usuarios')[1]
    expect(usrUpdateBuilder.update).toHaveBeenCalledWith({ usr_empleado_id: 10 })
    expect(usrUpdateBuilder.eq).toHaveBeenCalledWith('usr_id', 7)

    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })

  it('agrega una sucursal nueva a la asignación existente', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_EXISTE, UER_SYNC_SIN_CAMBIOS, OK],
      sgrh_sucursales: { data: [{ suc_id: 2 }, { suc_id: 3 }], error: null },
      sgrh_usuarios: [{ data: null, error: null }, OK],
    })

    const result = await updateUserAssignment(7, { ...INPUT, sucursal_ids: [2, 3] })

    expect(result).toEqual({ ok: true })

    const uerCalls = llamadasA(admin, 'sgrh_usuarios_empresa_rol')
    // uerCalls[0]=existencia, [1]=lectura interna, [2]=update sobreviviente, [3]=insert
    const insertBuilder = uerCalls[3]
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      { uer_usuario_id: 7, uer_empresa_id: 1, uer_rol_id: 4, uer_sucursal_id: 3, uer_activo: true },
    ])
  })

  it('permite desvincular al empleado (empleado_id null)', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_EXISTE, UER_SYNC_SIN_CAMBIOS, OK],
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: OK,
    })

    const result = await updateUserAssignment(7, { rol_id: 4, sucursal_ids: [2] })

    expect(result).toEqual({ ok: true })

    const usrUpdateBuilder = llamadasA(admin, 'sgrh_usuarios')[0]
    expect(usrUpdateBuilder.update).toHaveBeenCalledWith({ usr_empleado_id: null })
  })

  it('permite vaciar las sucursales (nivel empresa)', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_EXISTE, UER_SYNC_SIN_CAMBIOS, OK],
      sgrh_usuarios: [{ data: null, error: null }, OK],
    })

    const result = await updateUserAssignment(7, { rol_id: 4, sucursal_ids: [] })

    expect(result).toEqual({ ok: true })
    // sucursal_ids vacio: no valida contra sgrh_sucursales (nada que validar).
    expect(admin.from).not.toHaveBeenCalledWith('sgrh_sucursales')

    const uerCalls = llamadasA(admin, 'sgrh_usuarios_empresa_rol')
    // La fila existente (sucursal 2) no esta en la lista deseada [null]: se borra.
    const deleteBuilder = uerCalls[2]
    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(deleteBuilder.in).toHaveBeenCalledWith('uer_id', [55])
  })

  it('devuelve error si la sincronizacion de sucursales falla', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_EXISTE, { data: null, error: { message: 'boom' } }],
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: null, error: null },
    })

    const result = await updateUserAssignment(7, INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar la asignación del usuario.' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('avisa si el rol se guardó pero el vínculo falló', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_EXISTE, UER_SYNC_SIN_CAMBIOS, OK],
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
