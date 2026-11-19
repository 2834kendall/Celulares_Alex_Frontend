import { describe, expect, it } from 'vitest'
import { atrasadoParaLaCuenta, periodoAtrasado } from './estadoPeriodo'

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

describe('atrasadoParaLaCuenta', () => {
  const sucursal = { porEmpresa: true, cuentaDeEmpresa: false }

  it('una cuenta de sucursal sin filas suyas en el periodo de la empresa no lo ve atrasado', () => {
    expect(atrasadoParaLaCuenta(true, { ...sucursal, filasVisibles: 0 })).toBe(false)
  })

  it('con filas suyas sí', () => {
    expect(atrasadoParaLaCuenta(true, { ...sucursal, filasVisibles: 3 })).toBe(true)
  })

  it('una cuenta de toda la empresa lo ve atrasado aunque no vea filas', () => {
    expect(
      atrasadoParaLaCuenta(true, { porEmpresa: true, cuentaDeEmpresa: true, filasVisibles: 0 })
    ).toBe(true)
  })

  it('un periodo de una sola sucursal conserva su atraso', () => {
    expect(
      atrasadoParaLaCuenta(true, { porEmpresa: false, cuentaDeEmpresa: false, filasVisibles: 0 })
    ).toBe(true)
  })

  it('lo que no está atrasado no pasa a estarlo', () => {
    expect(atrasadoParaLaCuenta(false, { ...sucursal, filasVisibles: 0 })).toBe(false)
    expect(atrasadoParaLaCuenta(false, { ...sucursal, filasVisibles: 3 })).toBe(false)
  })
})
