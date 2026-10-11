import { describe, expect, it } from 'vitest'
import { periodoAtrasado } from './estadoPeriodo'

describe('periodoAtrasado', () => {
  it('un periodo en borrador que ya terminó está atrasado', () => {
    expect(periodoAtrasado('borrador', '2026-07-15', '2026-07-16')).toBe(true)
  })

  it('el mismo día en que termina todavía no está atrasado', () => {
    expect(periodoAtrasado('borrador', '2026-07-15', '2026-07-15')).toBe(false)
  })

  it('un periodo que aún no termina no está atrasado', () => {
    expect(periodoAtrasado('borrador', '2026-07-31', '2026-07-16')).toBe(false)
  })

  it('un periodo pagado nunca está atrasado, por viejo que sea', () => {
    expect(periodoAtrasado('pagado', '2020-01-15', '2026-07-16')).toBe(false)
  })

  it('sin fecha de fin no se puede afirmar que esté atrasado', () => {
    expect(periodoAtrasado('borrador', null, '2026-07-16')).toBe(false)
  })
})
