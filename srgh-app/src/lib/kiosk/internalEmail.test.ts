import { afterEach, describe, expect, it, vi } from 'vitest'
import { internalKioskEmail, isInternalKioskEmail, kioskEmailDomain } from './internalEmail'
import { KIOSK_LOGIN_PATTERN, normalizeKioskLogin } from './login'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('internal kiosk email (SGRH-111)', () => {
  it('uses a reserved domain by default', () => {
    vi.stubEnv('KIOSK_EMAIL_DOMAIN', '')
    expect(kioskEmailDomain()).toBe('kiosk.sgrh.internal')
    expect(internalKioskEmail('abc')).toBe('kiosk-abc@kiosk.sgrh.internal')
  })
  it('generates a different address for every kiosk', () => {
    expect(internalKioskEmail()).not.toBe(internalKioskEmail())
  })
  it('follows KIOSK_EMAIL_DOMAIN when a project needs another domain', () => {
    vi.stubEnv('KIOSK_EMAIL_DOMAIN', ' Kioscos.Ejemplo.CR ')
    expect(internalKioskEmail('abc')).toBe('kiosk-abc@kioscos.ejemplo.cr')
    expect(isInternalKioskEmail('KIOSK-ABC@kioscos.ejemplo.cr')).toBe(true)
  })
  it('does not treat a person address as internal', () => {
    expect(isInternalKioskEmail('ana@empresa.com')).toBe(false)
    expect(isInternalKioskEmail('ana@notkiosk.sgrh.internal')).toBe(false)
  })
})

describe('kiosk username', () => {
  it.each(['caja1', 'centro-caja.1', 'a_b'])('accepts %s', (value) => {
    expect(KIOSK_LOGIN_PATTERN.test(value)).toBe(true)
  })
  it.each(['ab', 'caja 1', '-caja', 'caja@x', 'Caja1', 'a'.repeat(41)])('rejects %s', (value) => {
    expect(KIOSK_LOGIN_PATTERN.test(value)).toBe(false)
  })
  it('normalizes spaces and case', () => {
    expect(normalizeKioskLogin('  Centro-Caja1 ')).toBe('centro-caja1')
  })
})
