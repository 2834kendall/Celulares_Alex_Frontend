import { describe, expect, it } from 'vitest'
import { sincronizarAusenciaEnNomina } from './ausenciaNominaSync'
import { createSupabaseClientMock } from '@/test/supabaseMock'

const BASE = { historialLaboralId: 7, fechaInicio: '2026-07-14', fechaFin: '2026-07-18' }

const PERIODO_1 = {
  npe_id: 101,
  npe_periodo_mes: 7,
  npe_periodo_anio: 2026,
  npe_quincena: 1,
  npe_fecha_inicio_periodo: '2026-07-01',
  npe_fecha_fin_periodo: '2026-07-15',
}
const PERIODO_2 = {
  npe_id: 102,
  npe_periodo_mes: 7,
  npe_periodo_anio: 2026,
  npe_quincena: 2,
  npe_fecha_inicio_periodo: '2026-07-16',
  npe_fecha_fin_periodo: '2026-07-31',
}

function client(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  return createSupabaseClientMock(responses) as unknown as Parameters<
    typeof sincronizarAusenciaEnNomina
  >[0]
}

describe('sincronizarAusenciaEnNomina', () => {
  it('devuelve error si falla la consulta de detalles', async () => {
    const supabase = client({ sgrh_nomina_detalle: { data: null, error: { message: 'boom' } } })

    const result = await sincronizarAusenciaEnNomina(supabase, { ...BASE, topeMensualEmpleador: 3 })

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron actualizar los periodos de nómina. Revisalo manualmente.',
    })
  })

  it('no toca nada si ningún periodo existente se traslapa con las fechas', async () => {
    const supabase = client({
      sgrh_nomina_detalle: {
        data: [
          {
            ndt_id: 1,
            ndt_dias_incapacidad_empleador: 0,
            ndt_dias_incapacidad_ccss: 0,
            sgrh_nomina_periodo: {
              ...PERIODO_1,
              npe_fecha_inicio_periodo: '2026-06-01',
              npe_fecha_fin_periodo: '2026-06-15',
            },
          },
        ],
        error: null,
      },
    })

    const result = await sincronizarAusenciaEnNomina(supabase, { ...BASE, topeMensualEmpleador: 3 })

    expect(result).toEqual({ ok: true, periodosActualizados: [], diasSinPeriodo: 5 })
  })

  it('reparte los días entre dos periodos del mismo mes respetando el tope mensual del patrono', async () => {
    const client_ = createSupabaseClientMock({
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 1,
              ndt_dias_incapacidad_empleador: 0,
              ndt_dias_incapacidad_ccss: 0,
              sgrh_nomina_periodo: PERIODO_1,
            },
            {
              ndt_id: 2,
              ndt_dias_incapacidad_empleador: 0,
              ndt_dias_incapacidad_ccss: 0,
              sgrh_nomina_periodo: PERIODO_2,
            },
          ],
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null },
      ],
    })

    const result = await sincronizarAusenciaEnNomina(
      client_ as unknown as Parameters<typeof sincronizarAusenciaEnNomina>[0],
      { ...BASE, topeMensualEmpleador: 3 }
    )

    // Periodo 1 (14-15 jul, 2 dias): todos al patrono (tope 3, 0 usados).
    // Periodo 2 (16-18 jul, 3 dias): solo queda 1 dia de tope, el resto a CCSS.
    expect(result).toEqual({
      ok: true,
      periodosActualizados: [
        { periodoId: 101, periodoLabel: expect.any(String), diasEmpleador: 2, diasCcss: 0 },
        { periodoId: 102, periodoLabel: expect.any(String), diasEmpleador: 1, diasCcss: 2 },
      ],
      diasSinPeriodo: 0,
    })
    expect(client_.from).toHaveBeenCalledWith('sgrh_nomina_detalle')
  })

  it('con tope 0 (ej. riesgo del trabajo), todos los días quedan a cargo de la CCSS', async () => {
    const client_ = createSupabaseClientMock({
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 1,
              ndt_dias_incapacidad_empleador: 0,
              ndt_dias_incapacidad_ccss: 0,
              sgrh_nomina_periodo: PERIODO_1,
            },
          ],
          error: null,
        },
        { data: null, error: null },
      ],
    })

    const result = await sincronizarAusenciaEnNomina(
      client_ as unknown as Parameters<typeof sincronizarAusenciaEnNomina>[0],
      {
        historialLaboralId: 7,
        fechaInicio: '2026-07-14',
        fechaFin: '2026-07-15',
        topeMensualEmpleador: 0,
      }
    )

    expect(result).toEqual({
      ok: true,
      periodosActualizados: [
        { periodoId: 101, periodoLabel: expect.any(String), diasEmpleador: 0, diasCcss: 2 },
      ],
      diasSinPeriodo: 0,
    })
  })

  it('devuelve error si falla al guardar alguna actualización', async () => {
    const client_ = createSupabaseClientMock({
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 1,
              ndt_dias_incapacidad_empleador: 0,
              ndt_dias_incapacidad_ccss: 0,
              sgrh_nomina_periodo: PERIODO_1,
            },
          ],
          error: null,
        },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await sincronizarAusenciaEnNomina(
      client_ as unknown as Parameters<typeof sincronizarAusenciaEnNomina>[0],
      {
        historialLaboralId: 7,
        fechaInicio: '2026-07-14',
        fechaFin: '2026-07-15',
        topeMensualEmpleador: 3,
      }
    )

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron actualizar todos los periodos de nómina. Revisalo manualmente.',
    })
  })
})
