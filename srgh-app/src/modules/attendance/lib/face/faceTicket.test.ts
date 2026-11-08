import { describe, expect, it } from 'vitest'
import { signFaceTicket, verifyFaceTicket } from './faceTicket'

const SECRET = 'secreto-de-prueba'
const NOW = 1_753_600_000_000

describe('faceTicket (HMAC-SHA256)', () => {
  it('vincula el comprobante a empresa, sucursal, kiosco y versión de acceso', async () => {
    const context = '1:10:kiosk-uuid:2'
    const ticket = await signFaceTicket(10, SECRET, NOW, undefined, context)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW + 1000, context)).toBe(true)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW + 1000, '1:20:kiosk-uuid:2')).toBe(false)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW + 1000, '1:10:other:2')).toBe(false)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW + 1000, '1:10:kiosk-uuid:3')).toBe(false)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW + 1000)).toBe(false)
  })
  it('no acepta un comprobante viejo sin contexto como prueba de un kiosco administrado', async () => {
    const ticket = await signFaceTicket(10, SECRET, NOW)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW, '1:10:kiosk:2')).toBe(false)
  })
  it('firma y verifica un ticket valido para el mismo empleado', async () => {
    const ticket = await signFaceTicket(10, SECRET, NOW)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW + 1000)).toBe(true)
  })

  it('rechaza el ticket de OTRO empleado', async () => {
    const ticket = await signFaceTicket(10, SECRET, NOW)
    expect(await verifyFaceTicket(ticket, 11, SECRET, NOW)).toBe(false)
  })

  it('rechaza un ticket expirado (TTL de 2 minutos)', async () => {
    const ticket = await signFaceTicket(10, SECRET, NOW)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW + 2 * 60 * 1000 + 1)).toBe(false)
  })

  it('rechaza una firma hecha con otro secreto', async () => {
    const ticket = await signFaceTicket(10, 'otro-secreto', NOW)
    expect(await verifyFaceTicket(ticket, 10, SECRET, NOW)).toBe(false)
  })

  it('rechaza un ticket con la expiracion adulterada', async () => {
    const ticket = await signFaceTicket(10, SECRET, NOW)
    const [emp, , sig] = ticket.split('.')
    const forged = `${emp}.${NOW + 999_999_999}.${sig}`
    expect(await verifyFaceTicket(forged, 10, SECRET, NOW)).toBe(false)
  })

  it('rechaza basura sin lanzar', async () => {
    expect(await verifyFaceTicket('no-es-un-ticket', 10, SECRET, NOW)).toBe(false)
    expect(await verifyFaceTicket('a.b.c', 10, SECRET, NOW)).toBe(false)
    expect(await verifyFaceTicket('', 10, SECRET, NOW)).toBe(false)
  })
})
