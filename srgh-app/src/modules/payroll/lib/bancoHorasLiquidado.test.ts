import { describe, expect, it } from 'vitest'
import {
  liquidacionQueDejoElMovimiento,
  type MovimientoConLiquidaciones,
} from './bancoHorasLiquidado'

type Liquidacion = { liq_id: number; liq_fecha_salida: string }

function movimiento(
  liquidaciones: { sgrh_liquidaciones: Liquidacion | Liquidacion[] | null }[] | null,
  over: { inicioContrato?: string; origen?: string | null } = {}
): MovimientoConLiquidaciones {
  return {
    bhm_created_at: '2026-08-20T10:00:00',
    sgrh_historial_laboral: {
      lab_fecha_inicio: over.inicioContrato ?? '2023-01-10',
      sgrh_empleados: { sgrh_historial_laboral: liquidaciones },
    },
    sgrh_nomina_detalle:
      over.origen === null
        ? null
        : { sgrh_nomina_periodo: { npe_fecha_inicio_periodo: over.origen ?? '2026-08-16' } },
  }
}

describe('liquidacionQueDejoElMovimiento', () => {
  // Ivannia: 0,5 h de agosto, liquidada en octubre antes del arreglo.
  it('reconoce la liquidación posterior a las horas', () => {
    const r = liquidacionQueDejoElMovimiento(
      movimiento([{ sgrh_liquidaciones: { liq_id: 4, liq_fecha_salida: '2026-10-07' } }])
    )
    expect(r).toEqual({ liqId: 4, fechaSalida: '2026-10-07' })
  })

  it('acepta la liquidación como lista (PostgREST sin relación 1 a 1)', () => {
    const r = liquidacionQueDejoElMovimiento(
      movimiento([{ sgrh_liquidaciones: [{ liq_id: 4, liq_fecha_salida: '2026-10-07' }] }])
    )
    expect(r?.liqId).toBe(4)
  })

  it('una liquidación de antes de las horas no cuenta (relación anterior)', () => {
    const r = liquidacionQueDejoElMovimiento(
      movimiento([{ sgrh_liquidaciones: { liq_id: 2, liq_fecha_salida: '2025-03-31' } }], {
        inicioContrato: '2025-06-01',
      })
    )
    expect(r).toBeNull()
  })

  it('un reingreso después de la salida no queda marcado', () => {
    const r = liquidacionQueDejoElMovimiento(
      movimiento([{ sgrh_liquidaciones: { liq_id: 2, liq_fecha_salida: '2026-08-31' } }], {
        inicioContrato: '2026-09-15',
        origen: '2026-09-16',
      })
    )
    expect(r).toBeNull()
  })

  // Reingreso a media quincena: la quincena del 16 empezó antes del contrato
  // nuevo (20/9) y la relación anterior terminó el 18/9.
  it('un reingreso a media quincena tampoco', () => {
    const r = liquidacionQueDejoElMovimiento(
      movimiento([{ sgrh_liquidaciones: { liq_id: 2, liq_fecha_salida: '2026-09-18' } }], {
        inicioContrato: '2026-09-20',
        origen: '2026-09-16',
      })
    )
    expect(r).toBeNull()
  })

  it('sin liquidación, null', () => {
    expect(liquidacionQueDejoElMovimiento(movimiento([{ sgrh_liquidaciones: null }]))).toBeNull()
    expect(liquidacionQueDejoElMovimiento(movimiento(null))).toBeNull()
  })

  it('sin periodo de origen usa la fecha del movimiento', () => {
    const r = liquidacionQueDejoElMovimiento(
      movimiento([{ sgrh_liquidaciones: { liq_id: 4, liq_fecha_salida: '2026-08-25' } }], {
        origen: null,
      })
    )
    expect(r?.liqId).toBe(4)
  })
})
