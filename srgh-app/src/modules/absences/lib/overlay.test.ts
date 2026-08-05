import { describe, expect, it } from 'vitest'
import { buildAusenciaOverlayEntries } from './overlay'
import type { AusenciaWeekRow } from '@/modules/absences/actions/getAusenciasForWeek'

const WEEK_DATES = [
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
  '2026-01-10',
  '2026-01-11',
]

function ausencia(overrides: Partial<AusenciaWeekRow>): AusenciaWeekRow {
  return {
    ausenciaId: 1,
    employmentHistoryId: 1,
    tipoAusenciaId: 3,
    fechaInicio: '2026-01-06',
    fechaFin: '2026-01-08',
    tipoCodigo: 'INC_ENF_CCSS',
    tipoNombre: 'Incapacidad por enfermedad (CCSS)',
    esIntradia: false,
    numeroBoletaCcss: null,
    observaciones: null,
    ...overrides,
  }
}

describe('buildAusenciaOverlayEntries', () => {
  it('expande el rango solo a los dias de la semana visible que cubre', () => {
    const entries = buildAusenciaOverlayEntries([ausencia({})], WEEK_DATES)

    expect(entries.map((e) => e.date)).toEqual(['2026-01-06', '2026-01-07', '2026-01-08'])
    expect(entries.every((e) => e.isIntraday === false)).toBe(true)
  })

  it('respeta el flag esIntradia del catalogo (ej. lactancia) sin importar el nombre/codigo', () => {
    const entries = buildAusenciaOverlayEntries(
      [
        ausencia({
          tipoCodigo: 'PERM_LACT_2026',
          tipoNombre: 'Permiso de Lactancia',
          esIntradia: true,
        }),
      ],
      WEEK_DATES
    )

    expect(entries.every((e) => e.isIntraday === true)).toBe(true)
  })

  it('no marca como intradia tipos con esIntradia en false', () => {
    const entries = buildAusenciaOverlayEntries(
      [
        ausencia({
          tipoCodigo: 'PERM_SINDICAL',
          tipoNombre: 'Permiso Sindical',
          esIntradia: false,
        }),
      ],
      WEEK_DATES
    )

    expect(entries.every((e) => e.isIntraday === false)).toBe(true)
  })

  it('no genera entradas para rangos fuera de la semana visible', () => {
    const entries = buildAusenciaOverlayEntries(
      [ausencia({ fechaInicio: '2025-12-01', fechaFin: '2025-12-05' })],
      WEEK_DATES
    )

    expect(entries).toEqual([])
  })
})
