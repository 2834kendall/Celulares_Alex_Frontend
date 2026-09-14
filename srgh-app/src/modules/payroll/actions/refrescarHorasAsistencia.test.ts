import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refrescarHorasAsistencia } from './refrescarHorasAsistencia'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'
// lineasNomina importa 'server-only', que revienta fuera de Next.js.
vi.mock('server-only', () => ({}))

import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
// El cálculo de horas tiene sus propios tests; acá interesa qué guarda la acción.
vi.mock('@/modules/payroll/lib/horasPeriodoData', () => ({ getHorasDelPeriodo: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockGetHoras = vi.mocked(getHorasDelPeriodo)

const OK = { data: null, error: null }

/** Fila armada con el prellenado de 88 h, sin que la asistencia entrara nunca. */
const DETALLE = {
  ndt_id: 50,
  ndt_nomina_periodo_id: 9,
  ndt_historial_laboral_id: 5,
  ndt_pagado: false,
  ndt_horas_ordinarias_diurnas: 88,
  ndt_horas_extra_al_50: 0,
  ndt_salario_por_hora: 3409.09,
  ndt_horas_asistencia: 88,
  ndt_horas_extra_asistencia: 0,
  sgrh_nomina_periodo: {
    npe_estado: 'borrador',
    npe_fecha_inicio_periodo: '2026-09-01',
    npe_fecha_fin_periodo: '2026-09-15',
  },
}

const CONCEPTOS = [
  {
    con_id: 1,
    con_codigo: 'BASE',
    con_tipo: 'ingreso',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
  {
    con_id: 6,
    con_codigo: 'CCSS_OBRERA',
    con_tipo: 'deduccion',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'porcentaje_deduccion_bruto',
    con_porcentaje: 10.83,
  },
]

/** 91 h trabajadas de 88 programadas, con 3 de extra. */
function totales(over: Record<string, unknown> = {}) {
  return {
    horasEsperadas: 88,
    horasOrdinarias: 91,
    horasExtra: 3,
    diasConProblema: [],
    diasQueBloquean: [],
    dias: [],
    ...over,
  }
}

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function escenario(
  detalle: Record<string, unknown> = {},
  over: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]> = {}
) {
  return mockSupabase({
    sgrh_nomina_detalle: [{ data: { ...DETALLE, ...detalle }, error: null }, OK],
    sgrh_cat_conceptos_nomina: { data: CONCEPTOS, error: null },
    sgrh_historial_laboral: { data: { lab_salario_base: 600000 }, error: null },
    sgrh_nomina_linea_ingreso: [
      {
        data: [
          {
            ing_monto: 300000,
            sgrh_cat_conceptos_nomina: { ...CONCEPTOS[0] },
          },
        ],
        error: null,
      },
      OK,
      OK,
    ],
    sgrh_nomina_linea_patronal: { data: null, error: null },
    sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK, OK],
    sgrh_banco_horas_movimientos: [{ data: null, error: null }, OK],
    ...over,
  })
}

function llamadas(
  client: ReturnType<typeof mockSupabase>,
  tabla: string,
  metodo: 'insert' | 'update'
) {
  return client.from.mock.results
    .filter((_, i) => client.from.mock.calls[i][0] === tabla)
    .flatMap((r) => {
      const fn = (r.value as Record<string, { mock: { calls: unknown[][] } }>)[metodo]
      return fn.mock.calls.map((args) => args[0])
    })
}

describe('refrescarHorasAsistencia (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 7 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    mockGetHoras.mockResolvedValue({ ok: true, data: new Map([[5, totales()]]) })
  })

  it('rechaza un detalle inválido sin llamar a Supabase', async () => {
    const result = await refrescarHorasAsistencia(0)

    expect(result).toEqual({ ok: false, error: 'Detalle inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('no toca un periodo que ya salió de borrador', async () => {
    escenario({ sgrh_nomina_periodo: { ...DETALLE.sgrh_nomina_periodo, npe_estado: 'pagado' } })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('borrador')
  })

  // Es el candado más importante: ese empleado ya tiene la plata, su
  // comprobante emitido y su aguinaldo acumulado sobre el bruto viejo.
  it('no toca una fila con el pago ya marcado', async () => {
    escenario({ ndt_pagado: true })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Desmarcá ese pago primero')
  })

  it('avisa sin escribir nada si las horas ya están al día', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasOrdinarias: 88, horasExtra: 0 })]]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result).toEqual({
      ok: true,
      horas: 88,
      horasExtra: 0,
      sinCambios: true,
      baseConservado: false,
    })
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toEqual([])
  })

  it('trae las horas nuevas, recalcula la fila y actualiza la foto', async () => {
    const client = escenario()

    const result = await refrescarHorasAsistencia(50)

    expect(result).toEqual({
      ok: true,
      horas: 91,
      horasExtra: 3,
      sinCambios: false,
      baseConservado: false,
    })

    const update = llamadas(client, 'sgrh_nomina_detalle', 'update')[0] as Record<string, unknown>
    expect(update).toMatchObject({
      ndt_horas_ordinarias_diurnas: 91,
      ndt_horas_extra_al_50: 3,
      // La foto queda igual a lo guardado: la fila vuelve a ser "origen
      // asistencia" y deja de aparecer como desactualizada.
      ndt_horas_asistencia: 91,
      ndt_horas_extra_asistencia: 3,
    })

    // El BASE guardado no se pierde al recalcular...
    expect(
      (llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert') as unknown[][]).flat()
    ).toContainEqual(expect.objectContaining({ ing_concepto_id: 1, ing_monto: 300000 }))
    // ...y la CCSS se recalcula sobre el bruto: 300000 * 10,83%.
    expect(
      (llamadas(client, 'sgrh_nomina_linea_deduccion', 'insert') as unknown[][]).flat()
    ).toContainEqual(expect.objectContaining({ ded_concepto_id: 6, ded_monto: 32490 }))
  })

  // Asignarle un horario a un día sube las horas programadas del periodo, y el
  // valor de la hora se prorratea sobre esas horas. Si no se recalculara,
  // refrescar dejaría un número distinto al de volver a subir el Excel.
  it('recalcula el valor de la hora con las horas programadas nuevas', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 96, horasOrdinarias: 96, horasExtra: 0 })]]),
    })

    await refrescarHorasAsistencia(50)

    // 600000 / 2 / 96 = 3125
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_salario_por_hora: 3125,
    })
  })

  // El bug que llegó al usuario: sin permisos de asistencia (o sin horario
  // asignado) RLS devuelve vacío SIN error, el cálculo da ceros, y eso no es
  // "trabajó 0 horas". Guardarlo le borraba las horas buenas al empleado y le
  // dejaba el banco de horas en cero.
  it('no guarda ceros cuando la lectura no sirve: rechaza y explica', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 0, horasOrdinarias: 0, horasExtra: 0 })]]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('horario programado')
      expect(result.error).toContain('permisos de asistencia')
    }
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toEqual([])
  })

  // Traer las horas sin mover el salario base no cambiaba un colón: el bruto
  // sale de los montos, no de las horas. Quien trabajó media quincena seguía
  // cobrando la quincena entera y el botón parecía no hacer nada.
  it('el salario base sigue a las horas nuevas', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 88, horasOrdinarias: 44, horasExtra: 0 })]]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.baseConservado).toBe(false)

    // Media jornada: el base baja de 300 000 a 150 000...
    expect(
      (llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert') as unknown[][]).flat()
    ).toContainEqual(expect.objectContaining({ ing_concepto_id: 1, ing_monto: 150000 }))
    // ...y el bruto guardado lo refleja.
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_salario_bruto: 150000,
    })
  })

  // Pero un base editado a mano no se pisa: se actualizan las horas y se avisa
  // que el monto quedó como estaba, para que alguien lo revise.
  it('un salario base editado a mano se conserva y se reporta', async () => {
    const client = escenario(
      {},
      {
        sgrh_nomina_linea_ingreso: [
          {
            data: [{ ing_monto: 275000, sgrh_cat_conceptos_nomina: { ...CONCEPTOS[0] } }],
            error: null,
          },
          OK,
          OK,
        ],
      }
    )
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 88, horasOrdinarias: 44, horasExtra: 0 })]]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.baseConservado).toBe(true)

    expect(
      (llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert') as unknown[][]).flat()
    ).toContainEqual(expect.objectContaining({ ing_concepto_id: 1, ing_monto: 275000 }))
    // Las horas sí se actualizaron.
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_horas_ordinarias_diurnas: 44,
    })
  })

  // Horas corregidas a mano (guardadas 80, foto 88): alguien decidió eso a
  // propósito. Pisarlo sin preguntar borraría la decisión sin dejar rastro.
  it('pide confirmación antes de pisar horas corregidas a mano', async () => {
    const client = escenario({ ndt_horas_ordinarias_diurnas: 80 })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.necesitaConfirmacion).toBe(true)
      expect(result.error).toContain('corregidas a mano')
    }
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toEqual([])
  })

  it('con la confirmación sí reemplaza la corrección', async () => {
    const client = escenario({ ndt_horas_ordinarias_diurnas: 80 })

    const result = await refrescarHorasAsistencia(50, true)

    expect(result.ok).toBe(true)
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_horas_ordinarias_diurnas: 91,
    })
  })
})
