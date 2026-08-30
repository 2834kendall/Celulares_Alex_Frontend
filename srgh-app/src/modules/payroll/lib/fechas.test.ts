import { describe, expect, it } from 'vitest'
import { hoyLocal, parseFechaLocal } from './fechas'

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
