import { describe, expect, it } from 'vitest'
import { ahoraLocal, hoyLocal, parseFechaLocal, rangoQuincena, ultimoDiaDelMes } from './fechas'

describe('rangoQuincena', () => {
  it('la primera quincena va del 1 al 15', () => {
    expect(rangoQuincena(7, 2026, 1)).toEqual({ inicio: '2026-07-01', fin: '2026-07-15' })
  })

  it('la segunda va del 16 al ultimo dia del mes', () => {
    expect(rangoQuincena(7, 2026, 2)).toEqual({ inicio: '2026-07-16', fin: '2026-07-31' })
    expect(rangoQuincena(4, 2026, 2)).toEqual({ inicio: '2026-04-16', fin: '2026-04-30' })
  })

  // Febrero es el caso que un "del 16 al 30" quemado en codigo rompe.
  it('acierta en febrero, tambien en anio bisiesto', () => {
    expect(rangoQuincena(2, 2026, 2)?.fin).toBe('2026-02-28')
    expect(rangoQuincena(2, 2028, 2)?.fin).toBe('2028-02-29')
  })

  it('devuelve null si el mes o la quincena no son validos', () => {
    expect(rangoQuincena(13, 2026, 1)).toBeNull()
    expect(rangoQuincena(0, 2026, 1)).toBeNull()
    expect(rangoQuincena(7, 2026, 3)).toBeNull()
    expect(rangoQuincena(7.5, 2026, 1)).toBeNull()
  })
})

describe('ultimoDiaDelMes', () => {
  it('devuelve los dias que tiene cada mes', () => {
    expect(ultimoDiaDelMes(1, 2026)).toBe(31)
    expect(ultimoDiaDelMes(2, 2026)).toBe(28)
    expect(ultimoDiaDelMes(2, 2028)).toBe(29)
    expect(ultimoDiaDelMes(4, 2026)).toBe(30)
    expect(ultimoDiaDelMes(12, 2026)).toBe(31)
  })
})

describe('parseFechaLocal', () => {
  it('parsea sin corrimiento de zona horaria', () => {
    const fecha = parseFechaLocal('2026-07-15')
    expect(fecha.getFullYear()).toBe(2026)
    expect(fecha.getMonth()).toBe(6)
    expect(fecha.getDate()).toBe(15)
  })

  /*
   * El motivo de que esta funcion exista en vez de usar `new Date(fecha)`:
   * el constructor interpreta 'YYYY-MM-DD' como UTC, asi que al oeste de
   * Greenwich devuelve el dia ANTERIOR. En Costa Rica (UTC-6) eso movia
   * cualquier fecha de planilla un dia hacia atras.
   */
  it('no se corre un dia hacia atras como si haria new Date(string)', () => {
    const fecha = parseFechaLocal('2026-01-01')
    expect(fecha.getDate()).toBe(1)
    expect(fecha.getMonth()).toBe(0)
  })
})

describe('hoyLocal / ahoraLocal (hora de Costa Rica)', () => {
  // 01:00 UTC del 31 de octubre = 19:00 del 30 en Costa Rica (UTC-6). Con la
  // hora del proceso, un servidor en UTC ya decía 31.
  const NOCHE_DEL_30 = new Date('2026-10-31T01:00:00Z')

  it('después de las 18:00 de Costa Rica sigue siendo el mismo día', () => {
    expect(hoyLocal(NOCHE_DEL_30)).toBe('2026-10-30')
    expect(ahoraLocal(NOCHE_DEL_30)).toBe('2026-10-30 19:00:00')
  })

  it('el 31 de diciembre a las 18:30 todavía es el año que termina', () => {
    expect(hoyLocal(new Date('2027-01-01T00:30:00Z'))).toBe('2026-12-31')
  })

  it('a medianoche de Costa Rica ya cambia de día', () => {
    expect(ahoraLocal(new Date('2026-11-01T06:00:00Z'))).toBe('2026-11-01 00:00:00')
  })

  it('siempre rellena mes, día y hora a dos dígitos', () => {
    expect(hoyLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ahoraLocal(new Date('2026-02-03T10:04:05Z'))).toBe('2026-02-03 04:04:05')
  })
})
