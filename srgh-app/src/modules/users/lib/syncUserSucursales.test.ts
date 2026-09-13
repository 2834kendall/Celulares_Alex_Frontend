import { describe, expect, it } from 'vitest'
import { syncUserSucursales } from './syncUserSucursales'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'

function mockAdmin(responses: Parameters<typeof createSupabaseAdminClientMock>[0]) {
  return createSupabaseAdminClientMock(responses)
}

function asAdminClient(admin: ReturnType<typeof mockAdmin>) {
  return admin as unknown as ReturnType<typeof createAdminClient>
}

const OK = { data: null, error: null }

describe('syncUserSucursales', () => {
  it('inserta una fila por sucursal cuando el usuario no tiene ninguna activa', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [{ data: [], error: null }, OK],
    })

    const result = await syncUserSucursales({
      admin: asAdminClient(admin),
      usrId: 7,
      empresaId: 1,
      rolId: 4,
      sucursalIds: [2, 3],
    })

    expect(result).toEqual({ error: null })

    // from(): read, insert (no hay sobrevivientes que actualizar ni nada que borrar)
    const insertBuilder = admin.from.mock.results[1].value
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      { uer_usuario_id: 7, uer_empresa_id: 1, uer_rol_id: 4, uer_sucursal_id: 2, uer_activo: true },
      { uer_usuario_id: 7, uer_empresa_id: 1, uer_rol_id: 4, uer_sucursal_id: 3, uer_activo: true },
    ])
  })

  it('inserta una unica fila con sucursal null cuando la lista deseada esta vacia', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [{ data: [], error: null }, OK],
    })

    await syncUserSucursales({
      admin: asAdminClient(admin),
      usrId: 7,
      empresaId: 1,
      rolId: 4,
      sucursalIds: [],
    })

    const insertBuilder = admin.from.mock.results[1].value
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      {
        uer_usuario_id: 7,
        uer_empresa_id: 1,
        uer_rol_id: 4,
        uer_sucursal_id: null,
        uer_activo: true,
      },
    ])
  })

  it('solo actualiza el rol cuando el conjunto de sucursales ya coincide', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [{ data: [{ uer_id: 55, uer_sucursal_id: 2 }], error: null }, OK],
    })

    const result = await syncUserSucursales({
      admin: asAdminClient(admin),
      usrId: 7,
      empresaId: 1,
      rolId: 5,
      sucursalIds: [2],
    })

    expect(result).toEqual({ error: null })
    expect(admin.from).toHaveBeenCalledTimes(2)

    const updateBuilder = admin.from.mock.results[1].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ uer_rol_id: 5 })
    expect(updateBuilder.in).toHaveBeenCalledWith('uer_id', [55])
    expect(updateBuilder.insert).not.toHaveBeenCalled()
    expect(updateBuilder.delete).not.toHaveBeenCalled()
  })

  it('agrega una sucursal nueva y conserva la existente', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [{ data: [{ uer_id: 55, uer_sucursal_id: 2 }], error: null }, OK],
    })

    await syncUserSucursales({
      admin: asAdminClient(admin),
      usrId: 7,
      empresaId: 1,
      rolId: 4,
      sucursalIds: [2, 3],
    })

    // from(): read, update(sobreviviente 55), insert(sucursal 3) — no delete
    expect(admin.from).toHaveBeenCalledTimes(3)

    const updateBuilder = admin.from.mock.results[1].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ uer_rol_id: 4 })
    expect(updateBuilder.in).toHaveBeenCalledWith('uer_id', [55])

    const insertBuilder = admin.from.mock.results[2].value
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      { uer_usuario_id: 7, uer_empresa_id: 1, uer_rol_id: 4, uer_sucursal_id: 3, uer_activo: true },
    ])
  })

  it('borra la sucursal quitada y conserva la que sigue', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [
        {
          data: [
            { uer_id: 55, uer_sucursal_id: 2 },
            { uer_id: 56, uer_sucursal_id: 3 },
          ],
          error: null,
        },
        OK,
      ],
    })

    await syncUserSucursales({
      admin: asAdminClient(admin),
      usrId: 7,
      empresaId: 1,
      rolId: 4,
      sucursalIds: [2],
    })

    // from(): read, update(sobreviviente 55), delete(56) — no insert
    expect(admin.from).toHaveBeenCalledTimes(3)

    const updateBuilder = admin.from.mock.results[1].value
    expect(updateBuilder.in).toHaveBeenCalledWith('uer_id', [55])

    const deleteBuilder = admin.from.mock.results[2].value
    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(deleteBuilder.in).toHaveBeenCalledWith('uer_id', [56])
  })

  it('devuelve error si falla la lectura de las filas existentes', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: { data: null, error: { message: 'boom' } },
    })

    const result = await syncUserSucursales({
      admin: asAdminClient(admin),
      usrId: 7,
      empresaId: 1,
      rolId: 4,
      sucursalIds: [2],
    })

    expect(result).toEqual({
      error: 'No se pudieron leer las sucursales actuales del usuario.',
    })
    expect(admin.from).toHaveBeenCalledTimes(1)
  })
})
