import { describe, expect, it, vi } from 'vitest'
import { anulableHasta, anulacionDe, leerHorasParaAnular, separarPagos } from './anulacionPagos'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))

const PAGADO_EN = '2026-12-02T15:00:00+00:00'
const HORA = 3_600_000

describe('anulableHasta', () => {
  const pago = { pex_pagado_en: PAGADO_EN, pex_anulado_en: null }
  const t = Date.parse(PAGADO_EN)

  it('dentro del plazo devuelve hasta cuándo', () => {
    expect(anulableHasta(pago, 48, t + 47 * HORA)).toBe('2026-12-04T15:00:00.000Z')
  })

  it('pasado el plazo, null', () => {
    expect(anulableHasta(pago, 48, t + 48 * HORA)).toBeNull()
    expect(anulableHasta(pago, 24, t + 25 * HORA)).toBeNull()
  })

  it('anulado o sin plazo conocido, null', () => {
    expect(anulableHasta({ ...pago, pex_anulado_en: PAGADO_EN }, 48, t)).toBeNull()
    expect(anulableHasta(pago, null, t)).toBeNull()
    expect(anulableHasta({ ...pago, pex_pagado_en: 'basura' }, 48, t)).toBeNull()
  })
})

describe('separarPagos', () => {
  const anulado = (id: number, en: string) => ({
    pex_id: id,
    pex_pagado_en: PAGADO_EN,
    pex_anulado_en: en,
    pex_anulado_por_nombre: 'Laura Vargas',
    pex_motivo_anulacion: `motivo ${id}`,
  })

  it('el vigente es el que no está anulado; del historial, la anulación más reciente', () => {
    const vigente = {
      pex_id: 3,
      pex_pagado_en: PAGADO_EN,
      pex_anulado_en: null,
      pex_anulado_por_nombre: null,
      pex_motivo_anulacion: null,
    }
    const r = separarPagos([
      anulado(1, '2026-12-02T16:00:00+00:00'),
      vigente,
      anulado(2, '2026-12-03T09:00:00+00:00'),
    ])
    expect(r.vigente?.pex_id).toBe(3)
    expect(r.ultimaAnulacion).toEqual({
      fecha: '2026-12-03T09:00:00+00:00',
      por: 'Laura Vargas',
      motivo: 'motivo 2',
    })
  })

  it('solo anulados: no hay vigente (vuelve a "sin pagar")', () => {
    const r = separarPagos([anulado(1, '2026-12-02T16:00:00+00:00')])
    expect(r.vigente).toBeNull()
    expect(r.ultimaAnulacion?.motivo).toBe('motivo 1')
  })

  it('sin pagos', () => {
    expect(separarPagos([])).toEqual({ vigente: null, ultimaAnulacion: null })
  })

  it('anulacionDe un pago vigente es null', () => {
    expect(
      anulacionDe({
        pex_pagado_en: PAGADO_EN,
        pex_anulado_en: null,
        pex_anulado_por_nombre: null,
        pex_motivo_anulacion: null,
      })
    ).toBeNull()
  })
})

describe('leerHorasParaAnular', () => {
  const cliente = (r: { data: unknown; error: unknown }) =>
    createSupabaseClientMock({ sgrh_empresas: r }) as unknown as Parameters<
      typeof leerHorasParaAnular
    >[0]

  it('lee el plazo de la empresa', async () => {
    expect(
      await leerHorasParaAnular(cliente({ data: { org_horas_anular_pago: 72 }, error: null }))
    ).toBe(72)
  })

  it('si no se puede leer, null: no se muestra el botón', async () => {
    expect(await leerHorasParaAnular(cliente({ data: null, error: { message: 'x' } }))).toBeNull()
    expect(await leerHorasParaAnular(cliente({ data: null, error: null }))).toBeNull()
  })
})
