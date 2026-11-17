import { describe, expect, it, vi } from 'vitest'
import { bloquesDelDia, loadDayJourney, salidaDelBloqueActual } from './dayJourney'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/empresa/get-usuario-sucursales', () => ({ getUsuarioSucursalScope: vi.fn() }))

type Admin = Parameters<typeof bloquesDelDia>[0]

function admin(tabla: string, data: unknown, error: unknown = null) {
  return createSupabaseClientMock({ [tabla]: { data, error } }) as unknown as Admin
}

const fila = (over: Record<string, unknown>) => ({
  prg_es_dia_libre: false,
  prg_hora_entrada_custom: null,
  prg_hora_salida_custom: null,
  sgrh_cat_horarios: null,
  ...over,
})

const PARTIDA = {
  hor_hora_entrada: '07:00:00',
  hor_hora_salida: '11:00:00',
  hor_hora_entrada_2: '16:00:00',
  hor_hora_salida_2: '20:00:00',
}

describe('bloquesDelDia', () => {
  it('una plantilla con jornada partida da dos bloques', async () => {
    const r = await bloquesDelDia(
      admin('sgrh_programacion_semanal', [fila({ sgrh_cat_horarios: PARTIDA })]),
      1,
      '2026-10-20'
    )
    expect(r).toEqual({
      ok: true,
      bloques: [
        { inicio: '07:00', fin: '11:00' },
        { inicio: '16:00', fin: '20:00' },
      ],
    })
  })

  it('dos tramos dan un bloque cada uno, en orden de hora', async () => {
    const r = await bloquesDelDia(
      admin('sgrh_programacion_semanal', [
        fila({ prg_hora_entrada_custom: '13:00:00', prg_hora_salida_custom: '17:00:00' }),
        fila({ prg_hora_entrada_custom: '08:00:00', prg_hora_salida_custom: '12:00:00' }),
      ]),
      1,
      '2026-10-19'
    )
    expect(r).toEqual({
      ok: true,
      bloques: [
        { inicio: '08:00', fin: '12:00' },
        { inicio: '13:00', fin: '17:00' },
      ],
    })
  })

  it('con entrada y salida propias el tramo es un solo bloque aunque la plantilla sea partida', async () => {
    const r = await bloquesDelDia(
      admin('sgrh_programacion_semanal', [
        fila({
          prg_hora_entrada_custom: '09:00:00',
          prg_hora_salida_custom: '15:00:00',
          sgrh_cat_horarios: PARTIDA,
        }),
      ]),
      1,
      '2026-10-20'
    )
    expect(r).toEqual({ ok: true, bloques: [{ inicio: '09:00', fin: '15:00' }] })
  })

  it('el dia libre no aporta bloques', async () => {
    const r = await bloquesDelDia(
      admin('sgrh_programacion_semanal', [
        fila({ prg_es_dia_libre: true, sgrh_cat_horarios: PARTIDA }),
      ]),
      1,
      '2026-10-20'
    )
    expect(r).toEqual({ ok: true, bloques: [] })
  })

  it('devuelve error si la consulta falla', async () => {
    const r = await bloquesDelDia(
      admin('sgrh_programacion_semanal', null, { message: 'offline' }),
      1,
      '2026-10-20'
    )
    expect(r).toEqual({ ok: false, error: 'No se pudo cargar la programacion del dia.' })
  })
})

describe('salidaDelBloqueActual', () => {
  const BLOQUES = [
    { inicio: '08:00', fin: '12:00' },
    { inicio: '13:00', fin: '17:00' },
  ]

  it('con un bloque o ninguno vale la salida del turno', () => {
    expect(salidaDelBloqueActual([], 0, '17:00')).toBe('17:00')
    expect(salidaDelBloqueActual([BLOQUES[0]], 0, '18:00')).toBe('18:00')
  })

  it('con varios vale la del bloque en curso', () => {
    expect(salidaDelBloqueActual(BLOQUES, 0, null)).toBe('12:00')
    expect(salidaDelBloqueActual(BLOQUES, 1, null)).toBe('17:00')
    expect(salidaDelBloqueActual(BLOQUES, 2, null)).toBe('17:00')
  })
})

describe('loadDayJourney con varios bloques', () => {
  const MARCAS = [
    { mar_id: 1, mar_tipo: 'entrada', mar_fecha_hora: '2026-10-19 08:00:00' },
    { mar_id: 2, mar_tipo: 'salida', mar_fecha_hora: '2026-10-19 12:00:00' },
  ]

  it('cerrado un bloque que no es el ultimo, la jornada del siguiente empieza vacia', async () => {
    const r = await loadDayJourney(admin('sgrh_marcas_asistencia', MARCAS), 1, '2026-10-19', 2)
    expect(r.ok && r.journey.entrada).toBeFalsy()
    expect(r.ok && r.journey.salida).toBeFalsy()
    expect(r.ok && r.salidas).toBe(1)
    // El snapshot sigue siendo de TODAS las marcas del dia.
    expect(r.ok && r.snapshot).toHaveLength(2)
  })

  it('con un solo bloque la salida cierra el dia', async () => {
    const r = await loadDayJourney(admin('sgrh_marcas_asistencia', MARCAS), 1, '2026-10-19')
    expect(r.ok && r.journey.salida).toBeTruthy()
  })
})
