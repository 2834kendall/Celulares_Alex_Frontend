import { describe, expect, it } from 'vitest'
import { sucursalesVisibles, sucursalVisibleParaLaCuenta } from './sucursalCuenta'

const cuenta = (sucursal_ids?: unknown) => ({ app_metadata: { sucursal_ids } })

describe('sucursalesVisibles', () => {
  it('sin sucursal_ids en el JWT ve toda la empresa (null)', () => {
    expect(sucursalesVisibles({})).toBeNull()
    expect(sucursalesVisibles({ app_metadata: {} })).toBeNull()
    expect(sucursalesVisibles(cuenta(undefined))).toBeNull()
  })

  it('devuelve solo los números de la lista', () => {
    expect(sucursalesVisibles(cuenta([1, 11]))).toEqual([1, 11])
    expect(sucursalesVisibles(cuenta([1, 'x', null, 11]))).toEqual([1, 11])
  })
})

describe('sucursalVisibleParaLaCuenta', () => {
  it('una cuenta de toda la empresa ve cualquier sucursal, incluso una desconocida', () => {
    expect(sucursalVisibleParaLaCuenta({}, 11)).toBe(true)
    expect(sucursalVisibleParaLaCuenta({}, null)).toBe(true)
    expect(sucursalVisibleParaLaCuenta({}, undefined)).toBe(true)
  })

  it('una cuenta de sucursal ve solo las suyas', () => {
    expect(sucursalVisibleParaLaCuenta(cuenta([1]), 1)).toBe(true)
    expect(sucursalVisibleParaLaCuenta(cuenta([1]), 11)).toBe(false)
    expect(sucursalVisibleParaLaCuenta(cuenta([1, 11]), 11)).toBe(true)
  })

  it('una cuenta de sucursal no ve un registro sin sucursal conocida', () => {
    expect(sucursalVisibleParaLaCuenta(cuenta([1]), null)).toBe(false)
    expect(sucursalVisibleParaLaCuenta(cuenta([1]), undefined)).toBe(false)
  })

  it('una lista vacía no ve nada (no se confunde con "toda la empresa")', () => {
    expect(sucursalVisibleParaLaCuenta(cuenta([]), 1)).toBe(false)
  })
})
