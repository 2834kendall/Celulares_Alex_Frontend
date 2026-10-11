import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reemplazarLineasDetalle } from './lineasNomina'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { createClient } from '@/lib/supabase/server'
import type { LineaCalculada } from '@/modules/payroll/lib/planilla'

// lineasNomina importa 'server-only', que revienta fuera de Next.js.
vi.mock('server-only', () => ({}))

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const OK = { data: null, error: null }

const LINEAS: LineaCalculada[] = [
  { con_id: 21, con_codigo: 'BASE', monto: 200000, esIngreso: true },
  { con_id: 14, con_codigo: 'DED004', monto: 10000, esIngreso: false },
  {
    con_id: 26,
    con_codigo: 'CCSS_OBRERA',
    monto: 21660,
    esIngreso: false,
    porcentajeAplicado: 10.83,
    baseCalculo: 200000,
  },
]

/** La última llamada a .insert() que se hizo contra una tabla. */
function ultimoInsert(client: ReturnType<typeof createSupabaseClientMock>, tabla: string) {
  const builders = client.from.mock.results
    .filter((_, i) => client.from.mock.calls[i][0] === tabla)
    .map((r) => r.value as Record<string, { mock: { calls: unknown[][] } }>)

  const conInsert = builders.filter((b) => b.insert.mock.calls.length > 0)
  return conInsert.at(-1)?.insert.mock.calls.at(-1)?.[0] as Record<string, unknown>[] | undefined
}

describe('reemplazarLineasDetalle', () => {
  beforeEach(() => vi.clearAllMocks())

  // El motor de cálculo solo sabe de conceptos y montos. De dónde vino una
  // deducción —de qué beneficio, si la autorizó el empleado, con qué nota— lo
  // pone otra parte del sistema, y borrar y reinsertar las líneas en cada
  // recálculo lo perdía en silencio.
  it('conserva los metadatos de las deducciones que ya existían', async () => {
    const client = createSupabaseClientMock({
      sgrh_nomina_linea_ingreso: [{ data: [], error: null }, OK, OK],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [
        {
          data: [
            {
              ded_concepto_id: 14,
              ded_es_voluntaria: true,
              ded_beneficio_id: 77,
              ded_observacion: 'Préstamo de marzo, cuota 3/6',
            },
          ],
          error: null,
        },
        OK,
        OK,
      ],
    })

    const { error } = await reemplazarLineasDetalle(
      client as unknown as SupabaseServerClient,
      1,
      LINEAS
    )

    expect(error).toBeNull()

    const deducciones = ultimoInsert(client, 'sgrh_nomina_linea_deduccion')!
    const prestamo = deducciones.find((d) => d.ded_concepto_id === 14)
    expect(prestamo).toMatchObject({
      ded_monto: 10000,
      ded_es_voluntaria: true,
      ded_beneficio_id: 77,
      ded_observacion: 'Préstamo de marzo, cuota 3/6',
    })

    // Un concepto que no estaba antes empieza sin metadatos.
    const ccss = deducciones.find((d) => d.ded_concepto_id === 26)
    expect(ccss).toMatchObject({
      ded_es_voluntaria: false,
      ded_beneficio_id: null,
      ded_observacion: null,
      ded_porcentaje_aplicado: 10.83,
      ded_base_calculo: 200000,
    })
  })

  it('guarda los ingresos con su monto calculado', async () => {
    const client = createSupabaseClientMock({
      sgrh_nomina_linea_ingreso: [{ data: [], error: null }, OK, OK],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK, OK],
    })

    await reemplazarLineasDetalle(client as unknown as SupabaseServerClient, 1, LINEAS)

    expect(ultimoInsert(client, 'sgrh_nomina_linea_ingreso')).toEqual([
      { ing_nomina_detalle_id: 1, ing_concepto_id: 21, ing_monto: 200000, ing_observacion: null },
    ])
  })

  it('no inserta nada si falla el borrado previo', async () => {
    const client = createSupabaseClientMock({
      sgrh_nomina_linea_ingreso: [
        { data: [], error: null },
        { data: null, error: { message: 'x' } },
      ],
      sgrh_nomina_linea_patronal: { data: null, error: null },
      sgrh_nomina_linea_deduccion: [{ data: [], error: null }, OK],
    })

    const { error } = await reemplazarLineasDetalle(
      client as unknown as SupabaseServerClient,
      1,
      LINEAS
    )

    expect(error).toBe('No se pudieron actualizar las líneas de la planilla.')
    expect(ultimoInsert(client, 'sgrh_nomina_linea_deduccion')).toBeUndefined()
  })
})
