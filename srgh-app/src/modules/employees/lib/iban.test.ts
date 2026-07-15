import { describe, expect, it } from 'vitest'
import {
  formatIbanGroups,
  ibanBankCode,
  IBAN_CR_REGEX,
  isValidIbanChecksum,
  normalizeIban,
} from './iban'

// IBAN CR de ejemplo del estándar ISO 13616 (BCR, entidad 152).
const IBAN_BCR = 'CR05015202001026284066'
// IBAN construido para tests con entidad 102 (BAC) y checksum recalculado.
const IBAN_BAC = 'CR02010200000000000001'

describe('normalizeIban', () => {
  it('quita espacios/guiones y pasa a mayúsculas', () => {
    expect(normalizeIban(' cr05 0152-0200 1026 2840 66 ')).toBe(IBAN_BCR)
  })
})

describe('formatIbanGroups', () => {
  it('agrupa de 4 en 4 para lectura', () => {
    expect(formatIbanGroups(IBAN_BCR)).toBe('CR05 0152 0200 1026 2840 66')
  })

  it('tolera valores parciales mientras se digita', () => {
    expect(formatIbanGroups('cr050')).toBe('CR05 0')
    expect(formatIbanGroups('')).toBe('')
  })
})

describe('ibanBankCode', () => {
  it('extrae el código de entidad (posiciones 6-8)', () => {
    expect(ibanBankCode(IBAN_BCR)).toBe('152')
    expect(ibanBankCode(IBAN_BAC)).toBe('102')
  })
})

describe('IBAN_CR_REGEX + isValidIbanChecksum', () => {
  it('acepta IBAN CR válidos', () => {
    for (const iban of [IBAN_BCR, IBAN_BAC]) {
      expect(iban).toMatch(IBAN_CR_REGEX)
      expect(isValidIbanChecksum(iban)).toBe(true)
    }
  })

  it('rechaza dígitos verificadores incorrectos', () => {
    expect(isValidIbanChecksum('CR06015202001026284066')).toBe(false)
    expect(isValidIbanChecksum('CR03010200000000000001')).toBe(false)
  })

  it('el regex rechaza largos y prefijos incorrectos', () => {
    expect('CR0501520200102628406').not.toMatch(IBAN_CR_REGEX) // 21 chars
    expect('NI05015202001026284066').not.toMatch(IBAN_CR_REGEX)
    expect('3242342').not.toMatch(IBAN_CR_REGEX)
  })
})
