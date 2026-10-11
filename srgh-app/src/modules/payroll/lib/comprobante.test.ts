import { describe, expect, it } from 'vitest'
import {
  confusionesEnCodigo,
  generarCodigoVerificacion,
  normalizarCodigoVerificacion,
} from './comprobante'

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

describe('normalizarCodigoVerificacion con texto copiado de un PDF o un correo', () => {
  it('acepta guiones tipográficos, espacios duros y puntos', () => {
    expect(normalizarCodigoVerificacion('ABCD‐EFGH‐JKMN')).toBe('ABCD-EFGH-JKMN') // U+2010
    expect(normalizarCodigoVerificacion('ABCD–EFGH—JKMN')).toBe('ABCD-EFGH-JKMN') // en/em dash
    expect(normalizarCodigoVerificacion('ABCD\u00a0EFGH\u202fJKMN')).toBe('ABCD-EFGH-JKMN')
    expect(normalizarCodigoVerificacion('abcd.efgh.jkmn')).toBe('ABCD-EFGH-JKMN')
  })
})

describe('confusionesEnCodigo', () => {
  it('nombra las letras y números que un código nunca lleva', () => {
    expect(confusionesEnCodigo('ABCD-EFGH-JKMN')).toEqual([])
    expect(confusionesEnCodigo('ABC0-EFGH-JKMO')).toEqual(['0', 'O'])
    expect(confusionesEnCodigo('IBCD-1FGH-JKLN')).toEqual(['I', '1', 'L'])
  })

  it('un código generado nunca tiene confusiones', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(confusionesEnCodigo(generarCodigoVerificacion())).toEqual([])
    }
  })
})
