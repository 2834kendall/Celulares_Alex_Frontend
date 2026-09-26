import { describe, expect, it } from 'vitest'
import { generarCodigoVerificacion } from './comprobante'

describe('generarCodigoVerificacion', () => {
  it('usa el formato XXXX-XXXX-XXXX', () => {
    expect(generarCodigoVerificacion()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('no usa caracteres que se confunden al dictarlo o copiarlo a mano', () => {
    const muestra = Array.from({ length: 200 }, generarCodigoVerificacion).join('')

    for (const prohibido of ['I', 'L', 'O', '0', '1']) {
      expect(muestra).not.toContain(prohibido)
    }
  })

  it('no se repite en una tanda razonable', () => {
    const codigos = new Set(Array.from({ length: 500 }, generarCodigoVerificacion))

    expect(codigos.size).toBe(500)
  })
})
