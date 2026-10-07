import { describe, expect, it, vi } from 'vitest'
import { createTimedFetch, describeRequest } from './timedFetch'

const BASE = 'https://proyecto.supabase.co'

describe('describeRequest', () => {
  it.each([
    [`${BASE}/rest/v1/sgrh_empleados?select=*`, 'GET', 'GET    rest sgrh_empleados'],
    [`${BASE}/rest/v1/rpc/terminar_contrato`, 'POST', 'POST   rest rpc/terminar_contrato'],
    [`${BASE}/storage/v1/object/sign/fotos`, 'POST', 'POST   storage object/sign/fotos'],
  ])('%s', (url, method, esperado) => {
    expect(describeRequest(url, method)).toBe(esperado)
  })

  it('acepta un Request', () => {
    expect(describeRequest(new Request(`${BASE}/rest/v1/sgrh_puestos`), 'GET')).toBe(
      'GET    rest sgrh_puestos'
    )
  })
})

describe('createTimedFetch', () => {
  it('delega en el fetch base y loguea la duración', async () => {
    const respuesta = new Response('ok')
    const baseFetch = vi.fn().mockResolvedValue(respuesta)
    const log = vi.fn()
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(312.4)

    const fetchMedido = createTimedFetch(baseFetch, log, now)
    const init = { method: 'PATCH' }

    await expect(fetchMedido(`${BASE}/rest/v1/sgrh_empleados`, init)).resolves.toBe(respuesta)
    expect(baseFetch).toHaveBeenCalledWith(`${BASE}/rest/v1/sgrh_empleados`, init)
    expect(log).toHaveBeenCalledWith('[sgrh:db] PATCH  rest sgrh_empleados 212 ms')
  })

  it('toma el método del Request y loguea aunque la petición falle', async () => {
    const baseFetch = vi.fn().mockRejectedValue(new Error('red caída'))
    const log = vi.fn()
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(50)

    const fetchMedido = createTimedFetch(baseFetch, log, now)
    const request = new Request(`${BASE}/rest/v1/sgrh_puestos`, { method: 'DELETE' })

    await expect(fetchMedido(request)).rejects.toThrow('red caída')
    expect(log).toHaveBeenCalledWith('[sgrh:db] DELETE rest sgrh_puestos 50 ms')
  })
})
