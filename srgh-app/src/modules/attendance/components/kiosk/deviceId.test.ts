import { beforeEach, describe, expect, it } from 'vitest'
import { getOrCreateDeviceId } from './deviceId'

describe('getOrCreateDeviceId', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('genera un id la primera vez y lo persiste', () => {
    const id = getOrCreateDeviceId()

    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(window.localStorage.getItem('sgrh_kiosco_dispositivo_id')).toBe(id)
  })

  it('devuelve el mismo id en llamadas posteriores', () => {
    const first = getOrCreateDeviceId()
    const second = getOrCreateDeviceId()

    expect(second).toBe(first)
  })
})
