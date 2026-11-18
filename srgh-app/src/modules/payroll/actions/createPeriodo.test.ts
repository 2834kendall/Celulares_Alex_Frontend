import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPeriodo } from './createPeriodo'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { CrearPeriodoInput } from '@/modules/payroll/types'
import { cargarEmpleadosDesdeAsistencia } from '@/modules/payroll/actions/cargarEmpleadosDesdeAsistencia'

// createPeriodo carga los empleados al terminar; esa acción tiene sus propios
// tests, así que acá se mockea para probar la creación en sí.
vi.mock('@/modules/payroll/actions/cargarEmpleadosDesdeAsistencia', () => ({
  cargarEmpleadosDesdeAsistencia: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/empresa/contexto-activo', () => ({ getFiltroMarca: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockCargar = vi.mocked(cargarEmpleadosDesdeAsistencia)

/** Lo que devuelve createPeriodo cuando la carga de empleados salió bien. */
const CARGA_OK = { empleadosCargados: 3, sinAsistencia: 0, avisoCarga: null, avisoAusencias: null }

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const INPUT: CrearPeriodoInput = {
  npe_sucursal_id: 2,
  npe_periodo_mes: 7,
  npe_periodo_anio: 2026,
  npe_quincena: 1,
  npe_fecha_inicio_periodo: '2026-07-01',
  npe_fecha_fin_periodo: '2026-07-15',
  npe_observaciones: null,
}

type Respuesta = { data: unknown; error: unknown }

/**
 * `periodo`: lo que devuelve sgrh_nomina_periodo (el insert y, si hace falta,
 * la búsqueda del que ya existía). `porEmpresa`: org_nomina_por_empresa.
 */
function mockInsert(periodo: Respuesta | Respuesta[], porEmpresa: boolean | null = false) {
  const client = createSupabaseClientMock({
    sgrh_nomina_periodo: periodo,
    sgrh_empresas:
      porEmpresa === null
        ? { data: null, error: { message: 'boom' } }
        : { data: { org_nomina_por_empresa: porEmpresa }, error: null },
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** El objeto que se mandó a insertar en sgrh_nomina_periodo. */
function insertado(client: ReturnType<typeof mockInsert>) {
  const i = client.from.mock.calls.findIndex(([t]) => t === 'sgrh_nomina_periodo')
  if (i === -1) return undefined
  const builder = client.from.mock.results[i].value as { insert: ReturnType<typeof vi.fn> }
  return builder.insert.mock.calls[0]?.[0]
}

describe('createPeriodo (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
    mockCargar.mockResolvedValue({
      ok: true,
      agregados: 3,
      yaEstaban: 0,
      sinAsistencia: 0,
      sinSalario: [],
    })
  })

  it('rechaza datos inválidos sin tocar la base', async () => {
    const result = await createPeriodo({ ...INPUT, npe_periodo_mes: 13 })

    expect(result).toEqual({ ok: false, error: 'Datos del periodo inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza fecha de fin anterior a la de inicio', async () => {
    const result = await createPeriodo({ ...INPUT, npe_fecha_fin_periodo: '2026-06-30' })

    expect(result).toEqual({ ok: false, error: 'Datos del periodo inválidos.' })
  })

  // De las fechas del periodo salen las horas de asistencia. Un periodo que
  // dice "Julio · 1ª quincena" pero tiene fechas de setiembre calcula la
  // planilla sobre el rango equivocado, y antes nada lo impedía.
  it('rechaza fechas que no caen en el mes y la quincena elegidos', async () => {
    const otroMes = await createPeriodo({
      ...INPUT,
      npe_fecha_inicio_periodo: '2026-09-01',
      npe_fecha_fin_periodo: '2026-09-15',
    })
    expect(otroMes).toEqual({ ok: false, error: 'Datos del periodo inválidos.' })

    // Fechas del mes correcto pero de la otra quincena.
    const otraQuincena = await createPeriodo({
      ...INPUT,
      npe_fecha_inicio_periodo: '2026-07-16',
      npe_fecha_fin_periodo: '2026-07-31',
    })
    expect(otraQuincena).toEqual({ ok: false, error: 'Datos del periodo inválidos.' })

    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza una sola fecha: van las dos o ninguna', async () => {
    const result = await createPeriodo({ ...INPUT, npe_fecha_fin_periodo: null })

    expect(result).toEqual({ ok: false, error: 'Datos del periodo inválidos.' })
  })

  // Se pueden borrar las dos y ponerlas después: la columna es nullable y el
  // formulario avisa que sin fechas no se leen las marcas de asistencia.
  it('acepta un periodo sin fechas', async () => {
    mockInsert({ data: { npe_id: 5 }, error: null })

    const result = await createPeriodo({
      ...INPUT,
      npe_fecha_inicio_periodo: null,
      npe_fecha_fin_periodo: null,
    })

    expect(result).toEqual({ ok: true, periodoId: 5, ...CARGA_OK })
  })

  it('devuelve error si el JWT no trae empresa_id', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
  })

  it('traduce el duplicado (23505) a un mensaje claro', async () => {
    mockInsert({ data: null, error: { code: '23505', message: 'duplicate' } })

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un periodo para esa sucursal, mes y quincena.',
    })
  })

  it('traduce el rechazo de RLS (42501) a un mensaje claro', async () => {
    mockInsert({ data: null, error: { code: '42501', message: 'rls' } })

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No tienes permiso para crear periodos de nómina.',
    })
  })

  it('crea el periodo y devuelve su id', async () => {
    mockInsert({ data: { npe_id: 99 }, error: null })

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({ ok: true, periodoId: 99, ...CARGA_OK })
  })

  // Crear el periodo dejaba una cabecera vacía y había que saber que el paso
  // siguiente era bajar y subir el Excel. Quien no lo sabía veía una planilla
  // en blanco con la asistencia ya registrada del otro lado.
  it('carga los empleados con sus horas apenas se crea el periodo', async () => {
    mockInsert({ data: { npe_id: 5 }, error: null })

    const result = await createPeriodo(INPUT)

    expect(result.ok).toBe(true)
    expect(mockCargar).toHaveBeenCalledWith(5)
    if (result.ok) expect(result.empleadosCargados).toBe(3)
  })

  // El periodo ya existe: deshacerlo porque la carga falló sería peor que
  // dejarlo vacío y avisar. Los empleados se cargan después con el botón.
  it('si la carga falla, el periodo igual queda creado y se devuelve el aviso', async () => {
    mockInsert({ data: { npe_id: 5 }, error: null })
    mockCargar.mockResolvedValue({ ok: false, error: 'La sucursal no tiene empleados activos.' })

    const result = await createPeriodo(INPUT)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.periodoId).toBe(5)
      expect(result.empleadosCargados).toBe(0)
      expect(result.avisoCarga).toContain('no tiene empleados activos')
    }
  })

  it('si no puede leer el modelo de la empresa, no crea nada', async () => {
    const client = mockInsert({ data: { npe_id: 5 }, error: null }, null)

    const result = await createPeriodo(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo leer la configuración de nómina de la empresa.',
    })
    expect(insertado(client)).toBeUndefined()
  })

  it('con un periodo por sucursal, la sucursal es obligatoria', async () => {
    const client = mockInsert({ data: { npe_id: 5 }, error: null })

    const result = await createPeriodo({ ...INPUT, npe_sucursal_id: null })

    expect(result).toEqual({ ok: false, error: 'La sucursal es obligatoria.' })
    expect(insertado(client)).toBeUndefined()
  })

  describe('con un periodo por empresa', () => {
    it('crea el periodo sin sucursal, aunque el formulario mande una', async () => {
      const client = mockInsert({ data: { npe_id: 7 }, error: null }, true)

      const result = await createPeriodo(INPUT)

      expect(result).toEqual({ ok: true, periodoId: 7, ...CARGA_OK })
      expect(insertado(client)).toMatchObject({ npe_sucursal_id: null, npe_empresa_id: 1 })
    })

    it('acepta el formulario sin sucursal', async () => {
      mockInsert({ data: { npe_id: 7 }, error: null }, true)

      const result = await createPeriodo({ ...INPUT, npe_sucursal_id: null })

      expect(result.ok).toBe(true)
    })

    // Otra cuenta (de otra sucursal) ya creó la quincena: es la misma para
    // toda la empresa, así que se va a esa en vez de dar error.
    it('si la quincena ya existe, devuelve ese periodo sin cargar a nadie', async () => {
      const client = mockInsert(
        [
          { data: null, error: { code: '23505', message: 'duplicate' } },
          { data: { npe_id: 31 }, error: null },
        ],
        true
      )

      const result = await createPeriodo(INPUT)

      expect(result).toEqual({
        ok: true,
        periodoId: 31,
        empleadosCargados: 0,
        sinAsistencia: 0,
        avisoCarga: null,
        yaExistia: true,
      })
      expect(mockCargar).not.toHaveBeenCalled()
      const busqueda = client.from.mock.results.filter(
        (_, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_periodo'
      )[1].value as { eq: ReturnType<typeof vi.fn> }
      expect(busqueda.eq.mock.calls).toEqual([
        ['npe_periodo_anio', 2026],
        ['npe_periodo_mes', 7],
        ['npe_quincena', 1],
      ])
    })

    it('si choca y no encuentra el existente, da el error de duplicado', async () => {
      mockInsert(
        [
          { data: null, error: { code: '23505', message: 'duplicate' } },
          { data: null, error: null },
        ],
        true
      )

      const result = await createPeriodo(INPUT)

      expect(result).toEqual({ ok: false, error: 'Ya existe un periodo para ese mes y quincena.' })
    })
  })
})
