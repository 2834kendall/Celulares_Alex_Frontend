import { describe, expect, it, vi } from 'vitest'
import { configSmtp, enviarCorreo } from './smtp'

vi.mock('server-only', () => ({}))

const sendMail = vi.fn()
const createTransport = vi.fn((opciones: unknown) => ({ sendMail, opciones }))
vi.mock('nodemailer', () => ({ default: { createTransport: (o: unknown) => createTransport(o) } }))

const COMPLETA = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_USER: 'planillas@empresa.com',
  SMTP_PASS: 'abcdefghijklmnop',
}

describe('configSmtp', () => {
  it('sin host, usuario o contraseña el envío no está configurado', () => {
    expect(configSmtp({})).toBeNull()
    expect(configSmtp({ ...COMPLETA, SMTP_HOST: '  ' })).toBeNull()
    expect(configSmtp({ ...COMPLETA, SMTP_USER: undefined })).toBeNull()
    expect(configSmtp({ ...COMPLETA, SMTP_PASS: '' })).toBeNull()
  })

  it('por defecto usa el puerto 465 con TLS y manda desde el usuario', () => {
    expect(configSmtp(COMPLETA)).toEqual({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: 'planillas@empresa.com',
      pass: 'abcdefghijklmnop',
      from: 'planillas@empresa.com',
    })
  })

  it('con el puerto 587 arranca sin TLS (STARTTLS), salvo que se pida', () => {
    expect(configSmtp({ ...COMPLETA, SMTP_PORT: '587' })).toMatchObject({
      port: 587,
      secure: false,
    })
    expect(configSmtp({ ...COMPLETA, SMTP_PORT: '587', SMTP_SECURE: 'true' })).toMatchObject({
      secure: true,
    })
  })

  it('respeta el remitente configurado', () => {
    expect(
      configSmtp({ ...COMPLETA, SMTP_FROM: 'Celulares Alex <planillas@empresa.com>' })?.from
    ).toBe('Celulares Alex <planillas@empresa.com>')
  })

  it('en Gmail acepta la contraseña de aplicación pegada con espacios', () => {
    expect(configSmtp({ ...COMPLETA, SMTP_PASS: 'abcd efgh ijkl mnop' })?.pass).toBe(
      'abcdefghijklmnop'
    )
    // Otro servidor: la contraseña puede tener espacios de verdad.
    expect(
      configSmtp({ ...COMPLETA, SMTP_HOST: 'mail.empresa.cr', SMTP_PASS: 'clave con espacios' })
        ?.pass
    ).toBe('clave con espacios')
  })

  it('un puerto inválido no se toma como configurado', () => {
    expect(configSmtp({ ...COMPLETA, SMTP_PORT: 'abc' })).toBeNull()
  })
})

describe('enviarCorreo', () => {
  it('manda el correo con el adjunto y con tiempos límite', async () => {
    sendMail.mockResolvedValue({})
    const config = configSmtp(COMPLETA)!

    await enviarCorreo(config, {
      to: 'ana@correo.com',
      subject: 'Asunto',
      text: 'texto',
      html: '<p>texto</p>',
      attachments: [
        { filename: 'c.pdf', content: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' },
      ],
    })

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'planillas@empresa.com', pass: 'abcdefghijklmnop' },
        connectionTimeout: 10_000,
        socketTimeout: 20_000,
      })
    )
    const enviado = sendMail.mock.calls[0][0]
    expect(enviado).toMatchObject({
      from: 'planillas@empresa.com',
      to: 'ana@correo.com',
      subject: 'Asunto',
    })
    expect(enviado.attachments[0].filename).toBe('c.pdf')
    expect([...enviado.attachments[0].content]).toEqual([1, 2, 3])
  })

  it('si el servidor rechaza el correo, el error sube', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('auth'), { code: 'EAUTH' }))

    await expect(
      enviarCorreo(configSmtp(COMPLETA)!, { to: 'a@b.cr', subject: 's', text: 't', html: 'h' })
    ).rejects.toMatchObject({ code: 'EAUTH' })
  })
})
