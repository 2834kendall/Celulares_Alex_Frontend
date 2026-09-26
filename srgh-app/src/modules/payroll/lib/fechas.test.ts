import { describe, expect, it } from 'vitest'
import { hoyLocal, parseFechaLocal, rangoQuincena, ultimoDiaDelMes } from './fechas'

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

describe('hoyLocal', () => {
  it('devuelve el dia de hoy en formato YYYY-MM-DD', () => {
    const hoy = new Date()
    const esperado = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(
      hoy.getDate()
    ).padStart(2, '0')}`

    expect(hoyLocal()).toBe(esperado)
  })

  it('siempre rellena mes y dia a dos digitos', () => {
    expect(hoyLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
