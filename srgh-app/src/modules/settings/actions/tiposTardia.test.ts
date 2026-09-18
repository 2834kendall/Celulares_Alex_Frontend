import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTipoTardia } from './createTipoTardia'
import { updateTipoTardia } from './updateTipoTardia'
import { deleteTipoTardia } from './deleteTipoTardia'
import { getTiposTardia } from './getTiposTardia'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { TipoTardiaInput } from '@/modules/settings/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

type ClientMock = ReturnType<typeof createSupabaseClientMock>

function useClient(client: ClientMock) {
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function lastCallOn(client: ClientMock, table: string) {
  const calls = client.from.mock.results.filter((_r, i) => client.from.mock.calls[i][0] === table)
  return calls[calls.length - 1].value
}

const valido: TipoTardiaInput = {
  tta_nombre: 'Tardia leve',
  tta_desde_minutos: 1,
  tta_cuenta_advertencia: true,
  tta_color: '#F59E0B',
}

const DUPLICADO = { code: '23505', message: 'duplicate key value' }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequirePermission.mockResolvedValue({
    app_metadata: { empresa_id: 1 },
  } as unknown as Awaited<ReturnType<typeof requirePermission>>)
})

describe('createTipoTardia', () => {
  it('rechaza datos invalidos sin pedir permiso', async () => {
    const result = await createTipoTardia({ ...valido, tta_desde_minutos: 0 })

    expect(result).toEqual({ ok: false, error: 'Datos del tipo de tardia invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un color que no es hex', async () => {
    const result = await createTipoTardia({ ...valido, tta_color: 'rojo' })

    expect(result.ok).toBe(false)
  })

  it('exige CATALOGOS_WRITE', async () => {
    useClient(
      createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: { tta_id: 9 }, error: null } })
    )

    await createTipoTardia(valido)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.CATALOGOS_WRITE)
  })

  it('crea el tipo en la empresa del usuario y refresca configuracion y asistencia', async () => {
    const client = useClient(
      createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: { tta_id: 9 }, error: null } })
    )

    const result = await createTipoTardia(valido)

    expect(result).toEqual({ ok: true, id: 9 })
    expect(lastCallOn(client, 'sgrh_cat_tipos_tardia').insert).toHaveBeenCalledWith({
      tta_empresa_id: 1,
      tta_nombre: 'Tardia leve',
      tta_desde_minutos: 1,
      tta_cuenta_advertencia: true,
      tta_color: '#F59E0B',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/attendance')
  })

  it('explica el choque cuando ya hay un tipo que empieza en ese minuto', async () => {
    useClient(createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: null, error: DUPLICADO } }))

    const result = await createTipoTardia({ ...valido, tta_desde_minutos: 6 })

    expect(result).toEqual({
      ok: false,
      error:
        'Ya hay un tipo de tardia que empieza en el minuto 6. Cada tipo tiene que empezar en un minuto distinto.',
    })
  })

  it('falla si el usuario no tiene empresa', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    expect(await createTipoTardia(valido)).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
  })
})

describe('updateTipoTardia', () => {
  it('actualiza el tipo', async () => {
    const client = useClient(
      createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: null, error: null } })
    )

    const result = await updateTipoTardia(4, { ...valido, tta_cuenta_advertencia: false })

    expect(result).toEqual({ ok: true })
    const builder = lastCallOn(client, 'sgrh_cat_tipos_tardia')
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ tta_cuenta_advertencia: false })
    )
    expect(builder.eq).toHaveBeenCalledWith('tta_id', 4)
  })

  it('explica el choque de minuto tambien al editar', async () => {
    useClient(createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: null, error: DUPLICADO } }))

    const result = await updateTipoTardia(4, { ...valido, tta_desde_minutos: 11 })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error).toContain('minuto 11')
  })

  it('devuelve error generico ante otros fallos', async () => {
    useClient(
      createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: null, error: { code: 'XX' } } })
    )

    expect(await updateTipoTardia(4, valido)).toEqual({
      ok: false,
      error: 'No se pudo actualizar el tipo de tardia.',
    })
  })
})

describe('deleteTipoTardia', () => {
  it('borra cuando quedan otros tipos', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_cat_tipos_tardia: [
          { data: [{ tta_id: 1 }, { tta_id: 2 }], error: null },
          { data: null, error: null },
        ],
      })
    )

    expect(await deleteTipoTardia(2)).toEqual({ ok: true })
    expect(lastCallOn(client, 'sgrh_cat_tipos_tardia').eq).toHaveBeenCalledWith('tta_id', 2)
  })

  it('no deja borrar el ultimo: sin tipos no se registraria ninguna tardanza', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_cat_tipos_tardia: { data: [{ tta_id: 1 }], error: null },
      })
    )

    const result = await deleteTipoTardia(1)

    expect(result.ok).toBe(false)
    expect(lastCallOn(client, 'sgrh_cat_tipos_tardia').delete).not.toHaveBeenCalled()
  })

  it('devuelve error si falla el borrado', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_cat_tipos_tardia: [
          { data: [{ tta_id: 1 }, { tta_id: 2 }], error: null },
          { data: null, error: { message: 'boom' } },
        ],
      })
    )

    expect(await deleteTipoTardia(2)).toEqual({
      ok: false,
      error: 'No se pudo eliminar el tipo de tardia.',
    })
  })
})

describe('getTiposTardia', () => {
  it('devuelve el catalogo ordenado por minuto de inicio', async () => {
    const client = useClient(
      createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: [], error: null } })
    )

    expect(await getTiposTardia()).toEqual({ ok: true, data: [] })
    expect(lastCallOn(client, 'sgrh_cat_tipos_tardia').order).toHaveBeenCalledWith(
      'tta_desde_minutos',
      { ascending: true }
    )
  })

  it('devuelve error si falla', async () => {
    useClient(
      createSupabaseClientMock({ sgrh_cat_tipos_tardia: { data: null, error: { message: 'x' } } })
    )

    expect(await getTiposTardia()).toEqual({
      ok: false,
      error: 'No se pudieron cargar los tipos de tardia.',
    })
  })
})
