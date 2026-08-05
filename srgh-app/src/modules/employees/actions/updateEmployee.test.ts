import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { updateEmployee } from './updateEmployee'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

const DIRECCION = { dir_distrito_id: 121, dir_senas_exactas: '200 m norte de la iglesia' }
const VALID_INPUT = { empleado: { emp_telefono: '8888-8888' }, direccion: DIRECCION }

// El empleado ya tiene dirección: la rama normal es UPDATE sobre la fila existente.
const EMPLEADO_CON_DIRECCION = { data: { emp_id: 10, emp_direccion_id: 7 }, error: null }
const DIRECCION_OK = { data: null, error: null }

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('updateEmployee (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza input inválido antes de tocar permisos o DB', async () => {
    const result = await updateEmployee(10, {
      empleado: { emp_telefono: 'no-es-telefono' },
      direccion: DIRECCION,
    })

    expect(result).toEqual({ ok: false, error: 'Datos del empleado inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza ids inválidos', async () => {
    const result = await updateEmployee(0, VALID_INPUT)

    expect(result).toEqual({ ok: false, error: 'Empleado no encontrado.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('convierte strings vacíos en null antes de guardar', async () => {
    const client = mockClient({
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '' },
      direccion: DIRECCION,
    })

    expect(result).toEqual({ ok: true })
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith({ emp_telefono: null })
  })

  it('mapea el error de identificación duplicada', async () => {
    mockClient({
      sgrh_empleados: {
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "sgrh_empleados_emp_numero_identificacion_key"',
        },
      },
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un empleado con ese número de identificación.',
    })
  })

  it('mapea el error de correo personal duplicado', async () => {
    mockClient({
      sgrh_empleados: {
        data: null,
        error: {
          code: '23505',
          details: 'Key (emp_email_personal)=(ana@mail.com) already exists.',
        },
      },
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un empleado con ese correo personal.',
    })
  })

  it('devuelve error generico si supabase falla', async () => {
    mockClient({
      sgrh_empleados: { data: null, error: { message: 'boom' } },
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el empleado.' })
  })

  it('actualiza la ficha y hace upsert de los datos de pago', async () => {
    const client = mockClient({
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
      sgrh_empleado_datos_pago: { data: null, error: null },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 3, edp_tipo_cuenta: 'AHORRO' },
    })

    expect(result).toEqual({ ok: true })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)

    // Orden de tablas: empleados → direcciones → datos_pago.
    const pagoBuilder = client.from.mock.results[2].value
    expect(pagoBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ edp_empleado_id: 10, edp_banco_id: 3 }),
      { onConflict: 'edp_empleado_id' }
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })

  it('rechaza un IBAN cuyo código de entidad no es el del banco elegido SIN escribir nada', async () => {
    const client = mockClient({
      // Banco Nacional (151); el IBAN de abajo es del BAC (102).
      sgrh_cat_bancos: { data: { ban_codigo: '151' }, error: null },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 5, edp_numero_cuenta: 'CR02 0102 0000 0000 0000 01' },
    })

    expect(result).toEqual({ ok: false, error: 'El IBAN no corresponde al banco seleccionado.' })
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledWith('sgrh_cat_bancos')
  })

  it('acepta el IBAN cuando el código de entidad coincide con el banco', async () => {
    mockClient({
      sgrh_cat_bancos: { data: { ban_codigo: '102' }, error: null },
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
      sgrh_empleado_datos_pago: { data: null, error: null },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 3, edp_numero_cuenta: 'CR02010200000000000001' },
    })

    expect(result).toEqual({ ok: true })
  })

  it('normaliza el número de cuenta (mayúsculas, sin espacios) antes de guardar', async () => {
    const client = mockClient({
      sgrh_cat_bancos: { data: { ban_codigo: '102' }, error: null },
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
      sgrh_empleado_datos_pago: { data: null, error: null },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 3, edp_numero_cuenta: ' cr02 0102 0000 0000 0000 01 ' },
    })

    expect(result).toEqual({ ok: true })
    // bancos → empleados → direcciones → datos_pago.
    const pagoBuilder = client.from.mock.results[3].value
    expect(pagoBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ edp_numero_cuenta: 'CR02010200000000000001' }),
      { onConflict: 'edp_empleado_id' }
    )
  })

  it('rechaza una cuenta sin banco seleccionado antes de tocar la DB', async () => {
    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_numero_cuenta: 'CR05015202001026284066' },
    })

    expect(result).toEqual({ ok: false, error: 'Datos del empleado inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('omite el upsert cuando no vienen datos de pago', async () => {
    const client = mockClient({
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({ ok: true })
    // Solo empleados y direcciones: nunca se toca sgrh_empleado_datos_pago.
    expect(client.from).toHaveBeenCalledTimes(2)
    expect(client.from).not.toHaveBeenCalledWith('sgrh_empleado_datos_pago')
  })

  it('avisa si la ficha se guardó pero los datos de pago fallaron', async () => {
    mockClient({
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
      sgrh_empleado_datos_pago: { data: null, error: { message: 'boom' } },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 3 },
    })

    expect(result).toEqual({
      ok: false,
      error: 'Los datos personales se guardaron, pero los datos de pago no. Intenta de nuevo.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  // ── Dirección ──────────────────────────────────────────────────────────────
  // Es padre del empleado (el FK sale de sgrh_empleados), así que no hay upsert:
  // o se actualiza la fila existente, o se crea y se enlaza.

  it('actualiza la dirección existente sin tocar el código postal', async () => {
    const client = mockClient({
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({ ok: true })
    const direccionBuilder = client.from.mock.results[1].value
    expect(direccionBuilder.update).toHaveBeenCalledWith(DIRECCION)
    // El postal lo recalcula el trigger: enviarlo desde el cliente no tendría efecto.
    expect(direccionBuilder.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ dir_codigo_postal: expect.anything() })
    )
    expect(direccionBuilder.eq).toHaveBeenCalledWith('dir_id', 7)
    expect(direccionBuilder.insert).not.toHaveBeenCalled()
  })

  it('crea y enlaza la dirección si el empleado no tenía (creado antes de la UI)', async () => {
    const client = mockClient({
      sgrh_empleados: [
        { data: { emp_id: 10, emp_direccion_id: null }, error: null },
        { data: null, error: null },
      ],
      sgrh_direcciones: { data: { dir_id: 42 }, error: null },
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({ ok: true })
    const direccionBuilder = client.from.mock.results[1].value
    expect(direccionBuilder.insert).toHaveBeenCalledWith(DIRECCION)

    const enlaceBuilder = client.from.mock.results[2].value
    expect(enlaceBuilder.update).toHaveBeenCalledWith({ emp_direccion_id: 42 })
  })

  it('avisa si la ficha se guardó pero la dirección no', async () => {
    mockClient({
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: { data: null, error: { message: 'boom' } },
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Los datos personales se guardaron, pero la dirección no. Intenta de nuevo.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('avisa si la dirección se creó pero el enlace al empleado falló', async () => {
    mockClient({
      sgrh_empleados: [
        { data: { emp_id: 10, emp_direccion_id: null }, error: null },
        { data: null, error: { message: 'boom' } },
      ],
      sgrh_direcciones: { data: { dir_id: 42 }, error: null },
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Los datos personales se guardaron, pero la dirección no. Intenta de nuevo.',
    })
  })

  it('rechaza una dirección sin distrito antes de tocar la DB', async () => {
    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: { dir_senas_exactas: '200 m norte de la iglesia' },
    } as unknown as Parameters<typeof updateEmployee>[1])

    expect(result).toEqual({ ok: false, error: 'Datos del empleado inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza señas demasiado cortas para ubicar la casa', async () => {
    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: { dir_distrito_id: 121, dir_senas_exactas: 'casa 2' },
    })

    expect(result).toEqual({ ok: false, error: 'Datos del empleado inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
