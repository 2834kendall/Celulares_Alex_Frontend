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

/** Fila armada con la jornada completa (96 h), sin que la asistencia entrara nunca. */
const DETALLE = {
  ndt_id: 50,
  ndt_nomina_periodo_id: 9,
  ndt_historial_laboral_id: 5,
  ndt_pagado: false,
  ndt_horas_ordinarias_diurnas: 96,
  ndt_horas_extra_al_50: 0,
  // Salario real 600000 / 30 / 8, y el neto tras la CCSS del 10,83 %.
  ndt_salario_por_hora: 2500,
  ndt_salario_bruto: 300000,
  ndt_salario_neto: 267510,
  ndt_horas_asistencia: 96,
  ndt_horas_extra_asistencia: 0,
  sgrh_nomina_periodo: {
    npe_estado: 'borrador',
    npe_periodo_mes: 9,
    npe_periodo_anio: 2026,
    npe_quincena: 1,
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
  {
    con_id: 25,
    con_codigo: 'AJUSTE',
    con_tipo: 'ingreso',
    con_afecta_salario_bruto: true,
    con_afecta_base_ccss: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_porcentaje: null,
  },
]

/** 99 h trabajadas de 96 programadas, con 3 de extra. */
function totales(over: Record<string, unknown> = {}) {
  return {
    horasEsperadas: 96,
    horasOrdinarias: 99,
    horasExtra: 3,
    diasConProblema: [],
    diasQueBloquean: [],
    horasAcreditadas: 0,
    diasAcreditadosSinHorario: 0,
    diasJustificados: 0,
    periodoCubiertoPorAusencias: false,
    horasProgramadasTotales: (over.horasEsperadas as number | undefined) ?? 96,
    diasJustificadosSinHorario: 0,
    diasSinProgramar: 0,
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
    sgrh_historial_laboral: {
      data: {
        lab_salario_base: 600000,
        lab_salario_real: 600000,
        sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: 48 },
      },
      error: null,
    },
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
      data: new Map([[5, totales({ horasOrdinarias: 96, horasExtra: 0 })]]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result).toEqual({
      ok: true,
      horas: 96,
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
      horas: 99,
      horasExtra: 3,
      sinCambios: false,
      baseConservado: false,
    })

    const update = llamadas(client, 'sgrh_nomina_detalle', 'update')[0] as Record<string, unknown>
    expect(update).toMatchObject({
      ndt_horas_ordinarias_diurnas: 99,
      ndt_horas_extra_al_50: 3,
      // La foto queda igual a lo guardado: la fila vuelve a ser "origen
      // asistencia" y deja de aparecer como desactualizada.
      ndt_horas_asistencia: 99,
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

  // Un solo día programado no cambia lo que vale la hora: eso lo dice el
  // contrato (salario real ÷ 30 ÷ 8). El pago, en cambio, es el cumplimiento
  // del horario cargado (regla del negocio): 9 de 9 h programadas es el 100 %.
  it('el valor de la hora sale del contrato, no de las horas programadas', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 9, horasOrdinarias: 9, horasExtra: 3 })]]),
    })

    await refrescarHorasAsistencia(50)

    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_salario_por_hora: 2500,
      ndt_salario_bruto: 300000,
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
      data: new Map([[5, totales({ horasEsperadas: 96, horasOrdinarias: 48, horasExtra: 0 })]]),
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
            data: [{ ing_monto: 260000, sgrh_cat_conceptos_nomina: { ...CONCEPTOS[0] } }],
            error: null,
          },
          OK,
          OK,
        ],
      }
    )
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 96, horasOrdinarias: 48, horasExtra: 0 })]]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.baseConservado).toBe(true)

    expect(
      (llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert') as unknown[][]).flat()
    ).toContainEqual(expect.objectContaining({ ing_concepto_id: 1, ing_monto: 260000 }))
    // Las horas sí se actualizaron.
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_horas_ordinarias_diurnas: 48,
    })
  })

  // El caso que quedó vivo tras el primer arreglo: la fila ya tenía las horas
  // correctas (9 y 3) pero el salario en ₡0. Como la condición miraba solo las
  // horas, la acción salía por "sin cambios" y el botón desaparecía de la
  // pantalla: no había forma de arreglarla.
  it('recalcula una fila en ₡0 aunque las horas ya estén al día', async () => {
    const client = escenario(
      { ndt_horas_ordinarias_diurnas: 99, ndt_horas_extra_al_50: 3, ndt_salario_bruto: 0 },
      { sgrh_nomina_linea_ingreso: [{ data: [], error: null }, OK, OK] }
    )

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sinCambios).toBe(false)

    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_salario_bruto: 300000,
    })
  })

  // Y si la fila ya está bien, sigue sin escribir nada.
  it('no escribe nada si las horas y el monto ya están bien', async () => {
    const client = escenario({ ndt_horas_ordinarias_diurnas: 99, ndt_horas_extra_al_50: 3 })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sinCambios).toBe(true)
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toEqual([])
  })

  // La tercera versión del mismo agujero: horas correctas y un monto distinto
  // de cero pero calculado con una fórmula vieja (9 h de 9 programadas →
  // ₡235.000). "Sin cambios" se decidía mirando las horas, antes de calcular,
  // y la fila mal guardada no se podía corregir desde ningún botón.
  it('rehace la fila cuando las horas coinciden pero el monto guardado no es el que da la cuenta', async () => {
    const client = escenario(
      {
        ndt_horas_ordinarias_diurnas: 9,
        ndt_horas_extra_al_50: 3,
        ndt_salario_por_hora: 33333.33,
        ndt_salario_bruto: 300000,
        ndt_salario_neto: 267510,
      },
      {
        sgrh_nomina_linea_ingreso: [
          {
            data: [{ ing_monto: 300000, sgrh_cat_conceptos_nomina: { ...CONCEPTOS[0] } }],
            error: null,
          },
          OK,
          OK,
        ],
      }
    )
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 9, horasOrdinarias: 9, horasExtra: 3 })]]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sinCambios).toBe(false)
    // El valor hora de la fila vieja (33.333) se corrige al del contrato.
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_salario_por_hora: 2500,
      ndt_salario_bruto: 300000,
    })
  })

  // El bug que reportó el usuario: una fila sin línea BASE se leía como
  // "salario editado a mano" y NO se restauraba. El botón actualizaba las
  // horas, dejaba el monto en ₡0, y encima avisaba "el salario base estaba
  // editado a mano" contra alguien que no editó nada.
  it('restaura el salario base cuando la fila no tiene ninguno', async () => {
    const client = escenario(
      {},
      {
        // Sin línea de BASE: la fila quedó en ₡0.
        sgrh_nomina_linea_ingreso: [{ data: [], error: null }, OK, OK],
      }
    )

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.baseConservado).toBe(false)

    // 99 h de 96 programadas: el cumplimiento se recorta a 1, cobra la quincena.
    expect(
      (llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert') as unknown[][]).flat()
    ).toContainEqual(expect.objectContaining({ ing_concepto_id: 1, ing_monto: 300000 }))
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_salario_bruto: 300000,
    })
  })

  // El valor de la hora sale del CONTRATO (600000 / 30 / 8 = 2500), no de las
  // horas que alguien alcanzó a programar. Con 9 h programadas daba ₡26.111 y
  // el banco de horas sugería pagar diez veces de más.
  it('el valor de la hora sale de la jornada del contrato, no del periodo', async () => {
    const client = escenario()
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([[5, totales({ horasEsperadas: 9, horasOrdinarias: 9, horasExtra: 3 })]]),
    })

    await refrescarHorasAsistencia(50)

    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_salario_por_hora: 2500,
    })
  })

  // Un contrato sin salario produce una fila con horas y ₡0 a pagar. Se
  // rechaza nombrando el dato que falta, en vez de guardar el cero.
  it('no toca la fila si el contrato no tiene salario', async () => {
    const client = escenario(
      {},
      {
        sgrh_historial_laboral: {
          data: { lab_salario_base: 0, sgrh_cat_tipos_jornada: null },
          error: null,
        },
      }
    )

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('no tiene salario base')
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toEqual([])
  })

  // Horas corregidas a mano (guardadas 80, foto 96): alguien decidió eso a
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
      ndt_horas_ordinarias_diurnas: 99,
    })
  })
  // El concepto BASE es el único código que el motor conoce de memoria: el
  // salario de la quincena se escribe ahí y se recoge buscándolo. Si alguien lo
  // desactiva o lo renombra desde el catálogo, el monto queda huérfano y la
  // fila se guardaba en ₡0 CON las horas correctas — un cero indistinguible de
  // "no trabajó", que es como llegó a producción.
  describe('cuando el catálogo no puede recibir el salario', () => {
    it('no guarda nada si no hay un concepto BASE activo', async () => {
      const client = escenario(
        {},
        { sgrh_cat_conceptos_nomina: { data: [CONCEPTOS[1]], error: null } }
      )

      const result = await refrescarHorasAsistencia(50)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('BASE')
      expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toHaveLength(0)
    })

    it('tampoco si el BASE dejó de contar como salario bruto', async () => {
      const client = escenario(
        {},
        {
          sgrh_cat_conceptos_nomina: {
            data: [{ ...CONCEPTOS[0], con_afecta_salario_bruto: false }, CONCEPTOS[1]],
            error: null,
          },
        }
      )

      const result = await refrescarHorasAsistencia(50)

      expect(result.ok).toBe(false)
      expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toHaveLength(0)
    })

    it('tampoco si el BASE se volvió un concepto patronal', async () => {
      const client = escenario(
        {},
        {
          sgrh_cat_conceptos_nomina: {
            data: [{ ...CONCEPTOS[0], con_tipo: 'patronal' }, CONCEPTOS[1]],
            error: null,
          },
        }
      )

      const result = await refrescarHorasAsistencia(50)

      expect(result.ok).toBe(false)
      expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toHaveLength(0)
    })
  })
  // Hallazgo de la auditoría: una fila armada con la regla que no acreditaba
  // las vacaciones (48 h trabajadas + 48 h de vacaciones → BASE de 150.000)
  // se leía como "BASE editado a mano" y el recálculo la dejaba igual,
  // respondiendo "sin cambios". Justo la fila que había que corregir.
  it('rehace un BASE armado con una regla vieja aunque las horas no cambien', async () => {
    const client = escenario(
      {
        ndt_horas_ordinarias_diurnas: 48,
        ndt_horas_extra_al_50: 0,
        ndt_horas_asistencia: 48,
        ndt_horas_extra_asistencia: 0,
        ndt_salario_por_hora: 2500,
        ndt_salario_bruto: 150000,
        ndt_salario_neto: 133755,
      },
      {
        sgrh_nomina_linea_ingreso: [
          {
            data: [{ ing_monto: 150000, sgrh_cat_conceptos_nomina: { ...CONCEPTOS[0] } }],
            error: null,
          },
          OK,
          OK,
        ],
      }
    )
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([
        [
          5,
          totales({
            horasEsperadas: 48,
            horasOrdinarias: 48,
            horasExtra: 0,
            horasAcreditadas: 48,
            horasProgramadasTotales: 96,
            diasJustificados: 6,
          }),
        ],
      ]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.sinCambios).toBe(false)
      expect(result.baseConservado).toBe(false)
    }
    expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
      ndt_salario_bruto: 300000,
    })
  })

  // Y uno corregido a mano sigue sin tocarse.
  it('un BASE que no es de ninguna regla del sistema se conserva', async () => {
    const client = escenario(
      { ndt_horas_ordinarias_diurnas: 48, ndt_horas_asistencia: 48, ndt_salario_bruto: 212345 },
      {
        sgrh_nomina_linea_ingreso: [
          {
            data: [{ ing_monto: 212345, sgrh_cat_conceptos_nomina: { ...CONCEPTOS[0] } }],
            error: null,
          },
          OK,
          OK,
        ],
      }
    )
    mockGetHoras.mockResolvedValue({
      ok: true,
      data: new Map([
        [
          5,
          totales({
            horasEsperadas: 48,
            horasOrdinarias: 48,
            horasExtra: 0,
            horasAcreditadas: 48,
            horasProgramadasTotales: 96,
          }),
        ],
      ]),
    })

    const result = await refrescarHorasAsistencia(50)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.baseConservado).toBe(true)
    const escrito = llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert') as unknown[][]
    expect(escrito.flat()).toContainEqual(expect.objectContaining({ ing_monto: 212345 }))
  })

  // El ajuste hasta el salario real se escribe solo, y uno puesto a mano
  // antes de que fuera automático se reemplaza.
  describe('ajuste automático', () => {
    const conReal = {
      sgrh_historial_laboral: {
        data: {
          lab_salario_base: 600000,
          lab_salario_real: 645000,
          sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: 48 },
        },
        error: null,
      },
    }

    it('escribe el ajuste hasta real ÷ 2 cuando se cumplió el horario', async () => {
      const client = escenario({}, conReal)

      await refrescarHorasAsistencia(50)

      const lineas = (llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert') as unknown[][]).flat()
      expect(lineas).toContainEqual(
        expect.objectContaining({ ing_concepto_id: 1, ing_monto: 300000 })
      )
      expect(lineas).toContainEqual(
        expect.objectContaining({ ing_concepto_id: 25, ing_monto: 22500 })
      )
      expect(llamadas(client, 'sgrh_nomina_detalle', 'update')[0]).toMatchObject({
        ndt_salario_bruto: 322500,
        ndt_salario_por_hora: 2687.5, // 645000 / 30 / 8
      })
    })

    it('reemplaza un ajuste digitado a mano por el de la regla', async () => {
      const client = escenario(
        {},
        {
          ...conReal,
          sgrh_nomina_linea_ingreso: [
            {
              data: [
                { ing_monto: 300000, sgrh_cat_conceptos_nomina: { ...CONCEPTOS[0] } },
                { ing_monto: 50000, sgrh_cat_conceptos_nomina: { ...CONCEPTOS[2] } },
              ],
              error: null,
            },
            OK,
            OK,
          ],
        }
      )

      await refrescarHorasAsistencia(50)

      const lineas = (llamadas(client, 'sgrh_nomina_linea_ingreso', 'insert') as unknown[][]).flat()
      expect(lineas).toContainEqual(
        expect.objectContaining({ ing_concepto_id: 25, ing_monto: 22500 })
      )
      expect(lineas).not.toContainEqual(expect.objectContaining({ ing_monto: 50000 }))
    })

    it('no guarda nada si el catálogo no tiene el concepto AJUSTE', async () => {
      const client = escenario(
        {},
        { sgrh_cat_conceptos_nomina: { data: CONCEPTOS.slice(0, 2), error: null } }
      )

      const result = await refrescarHorasAsistencia(50)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('AJUSTE')
      expect(llamadas(client, 'sgrh_nomina_detalle', 'update')).toHaveLength(0)
    })
  })
})
