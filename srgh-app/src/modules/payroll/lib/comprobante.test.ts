import { describe, expect, it } from 'vitest'
import { generarCodigoVerificacion, normalizarCodigoVerificacion } from './comprobante'

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

describe('normalizarCodigoVerificacion', () => {
  it('acepta minúsculas, espacios y sin guiones', () => {
    expect(normalizarCodigoVerificacion(' abcd efgh-jkmn ')).toBe('ABCD-EFGH-JKMN')
    expect(normalizarCodigoVerificacion('abcdefghjkmn')).toBe('ABCD-EFGH-JKMN')
    expect(normalizarCodigoVerificacion('ABCD-EFGH-JKMN')).toBe('ABCD-EFGH-JKMN')
  })

  it('rechaza lo que no tiene 12 letras o números', () => {
    expect(normalizarCodigoVerificacion('ABCD-EFGH')).toBeNull()
    expect(normalizarCodigoVerificacion('ABCD-EFGH-JKMN-P')).toBeNull()
    expect(normalizarCodigoVerificacion('ABCD-EFGH-JKM*')).toBeNull()
    expect(normalizarCodigoVerificacion('')).toBeNull()
  })
})
