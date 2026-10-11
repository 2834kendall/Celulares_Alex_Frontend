import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSettingsPath, readReturnPath, rememberReturnPath } from './returnPath'

describe('returnPath', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('isSettingsPath reconoce /settings y sus subrutas, nada más', () => {
    expect(isSettingsPath('/settings')).toBe(true)
    expect(isSettingsPath('/settings/employees/positions')).toBe(true)
    expect(isSettingsPath('/settingsx')).toBe(false)
    expect(isSettingsPath('/employees')).toBe(false)
  })

  it('sin nada guardado vuelve al inicio', () => {
    expect(readReturnPath()).toBe('/dashboard')
  })

  it('guarda la última pantalla fuera de Configuración, con su query', () => {
    rememberReturnPath('/employees?tab=usuarios')
    expect(readReturnPath()).toBe('/employees?tab=usuarios')
  })

  it('no pisa el destino al navegar dentro de Configuración', () => {
    rememberReturnPath('/payroll')
    rememberReturnPath('/settings/general')
    rememberReturnPath('/settings?x=1')
    expect(readReturnPath()).toBe('/payroll')
  })

  it('ignora lo que no sea una ruta interna (open redirect)', () => {
    window.sessionStorage.setItem('sgrh:settings-return-path', '//evil.example')
    expect(readReturnPath()).toBe('/dashboard')
    window.sessionStorage.setItem('sgrh:settings-return-path', 'https://evil.example')
    expect(readReturnPath()).toBe('/dashboard')
  })

  it('si el storage falla, no rompe y vuelve al inicio', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    expect(() => rememberReturnPath('/employees')).not.toThrow()
    expect(readReturnPath()).toBe('/dashboard')
  })
})
