import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { updateEmployee } from './updateEmployee'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { validateDatosPago } from '@/modules/employees/lib/validateDatosPago'
import { decryptField, encryptField } from '@/lib/crypto/fieldCrypto'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Ambos importan 'server-only', que revienta fuera de Next.js (ver
// planillaExcel.test.ts). La coherencia banco↔IBAN y la detección de duplicados
// se prueban en validateDatosPago.test.ts; el cifrado, en
// fieldCrypto.core.test.ts. Acá interesa el cableado y, sobre todo, el guard.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/crypto/fieldCrypto', () => ({
  encryptField: vi.fn(),
  decryptField: vi.fn(),
}))
vi.mock('@/modules/employees/lib/validateDatosPago', () => ({ validateDatosPago: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockValidateDatosPago = vi.mocked(validateDatosPago)
const mockEncryptField = vi.mocked(encryptField)
const mockDecryptField = vi.mocked(decryptField)

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

type BuilderMock = Record<string, ReturnType<typeof vi.fn>>

/**
 * Builder de la n-ésima llamada a una tabla. Por índice absoluto sería frágil:
 * sgrh_empleado_datos_pago se consulta dos veces cuando corre el guard (leer lo
 * guardado) y una sola cuando no.
 */
function builderDe(
  client: ReturnType<typeof mockClient>,
  tabla: string,
  ocurrencia = 0
): BuilderMock {
  const indices = client.from.mock.calls
    .map((call, i) => (call[0] === tabla ? i : -1))
    .filter((i) => i >= 0)
  return client.from.mock.results[indices[ocurrencia]].value as unknown as BuilderMock
}

/** Objeto que recibió el upsert de datos de pago. */
function payloadUpsert(client: ReturnType<typeof mockClient>, ocurrencia = 0) {
  const builder = builderDe(client, 'sgrh_empleado_datos_pago', ocurrencia)
  return builder.upsert.mock.calls[0][0] as Record<string, unknown>
}

describe('updateEmployee (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
    mockValidateDatosPago.mockResolvedValue({ ok: true, hmac: null })
    mockEncryptField.mockImplementation(async (valor: string) => `enc:${valor}`)
    mockDecryptField.mockImplementation(async (stored) => ({ ok: true, value: stored }))
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

    const pagoBuilder = builderDe(client, 'sgrh_empleado_datos_pago', 1)
    expect(pagoBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ edp_empleado_id: 10, edp_banco_id: 3 }),
      { onConflict: 'edp_empleado_id' }
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees/10')
  })

  it('aborta sin escribir nada si la validación de datos de pago falla', async () => {
    // La coherencia banco↔IBAN vive en validateDatosPago; acá importa que se
    // consulte ANTES de escribir, porque esta action no es transaccional.
    mockValidateDatosPago.mockResolvedValue({
      ok: false,
      error: 'El IBAN no corresponde al banco seleccionado.',
    })
    const client = mockClient({})

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 5, edp_numero_cuenta: 'CR02 0102 0000 0000 0000 01' },
    })

    expect(result).toEqual({ ok: false, error: 'El IBAN no corresponde al banco seleccionado.' })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('pide confirmación si la cuenta ya está en otro empleado, sin escribir nada', async () => {
    mockValidateDatosPago.mockResolvedValue({
      ok: false,
      error: 'Esta cuenta ya está registrada para María Rodríguez.',
      requiereConfirmacion: true,
    })
    const client = mockClient({})

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 3, edp_numero_cuenta: 'CR02010200000000000001' },
    })

    expect(result).toMatchObject({ ok: false, requiereConfirmacion: true })
    expect(client.from).not.toHaveBeenCalled()
    // Excluirse a sí mismo es lo que evita que editar la ficha sin tocar la
    // cuenta se detecte como duplicado de su propia fila.
    expect(mockValidateDatosPago).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      empIdActual: 10,
      confirmado: undefined,
    })
  })

  it('normaliza el número de cuenta y lo guarda CIFRADO, con su índice', async () => {
    mockValidateDatosPago.mockResolvedValue({ ok: true, hmac: 'hmac-de-la-cuenta' })
    const client = mockClient({
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
    // La normalización sigue existiendo (la hace el schema); lo que cambió es
    // que ahora se verifica sobre el texto plano que entra a cifrarse.
    expect(mockEncryptField).toHaveBeenCalledWith('CR02010200000000000001')

    const pagoBuilder = builderDe(client, 'sgrh_empleado_datos_pago')
    expect(pagoBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        edp_numero_cuenta: 'enc:CR02010200000000000001',
        edp_cuenta_hmac: 'hmac-de-la-cuenta',
      }),
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

  // ── Guard: vacío solo significa "borrar" si el usuario pudo ver lo que había ─
  //
  // Desde que la cuenta se guarda cifrada existe un estado nuevo: hay número
  // registrado pero no se pudo descifrar. La ficha se pinta vacía, y si ese
  // vacío se tomara como intención de borrar, editar el teléfono bastaría para
  // perder la cuenta. Estos tres tests son los que impiden que vuelva.

  it('NO borra la cuenta cuando está ilegible y el campo llega vacío', async () => {
    mockDecryptField.mockResolvedValue({ ok: false })
    const client = mockClient({
      sgrh_empleado_datos_pago: [
        { data: { edp_numero_cuenta: 'v1:rota:rota' }, error: null }, // lectura del guard
        { data: null, error: null }, // upsert
      ],
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 3, edp_tipo_cuenta: 'AHORRO' },
    })

    // El resto de la edición sí se guarda: un IBAN ilegible no puede dejar a
    // RRHH sin poder corregir un teléfono.
    expect(result).toMatchObject({ ok: true })
    expect(result.ok === true && result.warning).toContain('no se pudo descifrar')

    // Omitir AMBAS columnas del payload las deja intactas: PostgREST solo
    // actualiza las que vienen en el objeto. Se comprueba que la CLAVE no
    // exista, no que valga null — con expect.anything() este test pasaría
    // igual sin el guard, porque anything() no matchea null.
    const payload = payloadUpsert(client, 1)
    expect(payload).not.toHaveProperty('edp_numero_cuenta')
    expect(payload).not.toHaveProperty('edp_cuenta_hmac')
    expect(payload).toMatchObject({ edp_empleado_id: 10, edp_banco_id: 3 })
  })

  it('SÍ borra la cuenta cuando era legible y el usuario la dejó vacía', async () => {
    // Acá el vacío es una decisión real: el usuario vio el número y lo quitó.
    const client = mockClient({
      sgrh_empleado_datos_pago: [
        { data: { edp_numero_cuenta: 'v1:ok:ok' }, error: null },
        { data: null, error: null },
      ],
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 3, edp_tipo_cuenta: 'AHORRO' },
    })

    expect(result).toEqual({ ok: true })
    const pagoBuilder = builderDe(client, 'sgrh_empleado_datos_pago', 1)
    // Las dos columnas se nulan juntas: un HMAC huérfano generaría falsos
    // duplicados contra un número que ya nadie tiene.
    expect(pagoBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ edp_numero_cuenta: null, edp_cuenta_hmac: null }),
      { onConflict: 'edp_empleado_id' }
    )
  })

  it('reemplaza una cuenta ilegible cuando el usuario escribe una nueva', async () => {
    // Es el camino de reparación: escribir siempre pisa, sin importar qué había.
    mockDecryptField.mockResolvedValue({ ok: false })
    mockValidateDatosPago.mockResolvedValue({ ok: true, hmac: 'hmac-nuevo' })
    const client = mockClient({
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
    // Con número entrante ni siquiera se lee lo guardado: no hay ambigüedad.
    expect(mockDecryptField).not.toHaveBeenCalled()

    const pagoBuilder = builderDe(client, 'sgrh_empleado_datos_pago')
    expect(pagoBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        edp_numero_cuenta: 'enc:CR02010200000000000001',
        edp_cuenta_hmac: 'hmac-nuevo',
      }),
      { onConflict: 'edp_empleado_id' }
    )
  })

  it('explica el 23514 del constraint en vez del error genérico', async () => {
    // Fila cifrada antes de que existiera el índice: el guard conserva el
    // ciphertext, el HMAC sigue nulo y edp_cuenta_hmac_pareado rechaza. Lo
    // arregla correr el backfill, no el usuario.
    mockDecryptField.mockResolvedValue({ ok: false })
    mockClient({
      sgrh_empleado_datos_pago: [
        { data: { edp_numero_cuenta: 'v1:rota:rota' }, error: null },
        { data: null, error: { code: '23514', message: 'edp_cuenta_hmac_pareado' } },
      ],
      sgrh_empleados: EMPLEADO_CON_DIRECCION,
      sgrh_direcciones: DIRECCION_OK,
    })

    const result = await updateEmployee(10, {
      empleado: { emp_telefono: '8888-8888' },
      direccion: DIRECCION,
      datos_pago: { edp_banco_id: 3 },
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('pendiente de migración')
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
