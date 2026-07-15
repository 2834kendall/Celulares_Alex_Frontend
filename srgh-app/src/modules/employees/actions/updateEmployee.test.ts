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

const VALID_INPUT = { empleado: { emp_telefono: '8888-8888' } }

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
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
    })

    const result = await updateEmployee(10, { empleado: { emp_telefono: '' } })

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
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
      sgrh_empleado_datos_pago: { data: null, error: null },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      datos_pago: { edp_banco_id: 3, edp_tipo_cuenta: 'AHORRO' },
    })

    expect(result).toEqual({ ok: true })
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.EMPLEADOS_WRITE)

    const pagoBuilder = client.from.mock.results[1].value
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
      datos_pago: { edp_banco_id: 5, edp_numero_cuenta: 'CR02 0102 0000 0000 0000 01' },
    })

    expect(result).toEqual({ ok: false, error: 'El IBAN no corresponde al banco seleccionado.' })
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledWith('sgrh_cat_bancos')
  })

  it('acepta el IBAN cuando el código de entidad coincide con el banco', async () => {
    mockClient({
      sgrh_cat_bancos: { data: { ban_codigo: '102' }, error: null },
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
      sgrh_empleado_datos_pago: { data: null, error: null },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      datos_pago: { edp_banco_id: 3, edp_numero_cuenta: 'CR02010200000000000001' },
    })

    expect(result).toEqual({ ok: true })
  })

  it('normaliza el número de cuenta (mayúsculas, sin espacios) antes de guardar', async () => {
    const client = mockClient({
      sgrh_cat_bancos: { data: { ban_codigo: '102' }, error: null },
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
      sgrh_empleado_datos_pago: { data: null, error: null },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      datos_pago: { edp_banco_id: 3, edp_numero_cuenta: ' cr02 0102 0000 0000 0000 01 ' },
    })

    expect(result).toEqual({ ok: true })
    const pagoBuilder = client.from.mock.results[2].value
    expect(pagoBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ edp_numero_cuenta: 'CR02010200000000000001' }),
      { onConflict: 'edp_empleado_id' }
    )
  })

  it('rechaza una cuenta sin banco seleccionado antes de tocar la DB', async () => {
    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      datos_pago: { edp_numero_cuenta: 'CR05015202001026284066' },
    })

    expect(result).toEqual({ ok: false, error: 'Datos del empleado inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('omite el upsert cuando no vienen datos de pago', async () => {
    const client = mockClient({
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
    })

    const result = await updateEmployee(10, VALID_INPUT)

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('avisa si la ficha se guardó pero los datos de pago fallaron', async () => {
    mockClient({
      sgrh_empleados: { data: { emp_id: 10 }, error: null },
      sgrh_empleado_datos_pago: { data: null, error: { message: 'boom' } },
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      datos_pago: { edp_banco_id: 3 },
    })

    expect(result).toEqual({
      ok: false,
      error: 'Los datos personales se guardaron, pero los datos de pago no. Intenta de nuevo.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
