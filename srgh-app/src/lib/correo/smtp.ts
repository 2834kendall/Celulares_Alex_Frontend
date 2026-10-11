/**
 * Envío de correos por SMTP (nodemailer).
 *
 * Supabase solo manda los correos de autenticación (invitación, contraseña);
 * los demás —como el comprobante de pago— salen por acá, con la cuenta de la
 * empresa configurada en .env.local:
 *
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=465
 *   SMTP_USER=planillas@empresa.com
 *   SMTP_PASS=<contraseña de aplicación>
 *   SMTP_FROM="Celulares Alex <planillas@empresa.com>"   (opcional, por defecto SMTP_USER)
 *   SMTP_SECURE=true                                    (opcional, por defecto true con el puerto 465)
 *
 * Con Gmail, SMTP_PASS es una "contraseña de aplicación" (Cuenta de Google →
 * Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones), no la
 * contraseña normal de la cuenta.
 */

import 'server-only'
import nodemailer from 'nodemailer'

export interface ConfigSmtp {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

/**
 * La configuración SMTP del entorno, o null si falta algún dato obligatorio.
 * Null quiere decir "el envío de correos no está configurado", no un error.
 */
export function configSmtp(
  env: Record<string, string | undefined> = process.env
): ConfigSmtp | null {
  const host = env.SMTP_HOST?.trim()
  const user = env.SMTP_USER?.trim()
  // Google muestra la contraseña de aplicación en grupos ("abcd efgh ijkl
  // mnop") y es fácil pegarla así. Nunca lleva espacios, así que en Gmail se
  // quitan; en otro servidor la contraseña se respeta tal cual.
  const pass =
    host && /(^|\.)(gmail|googlemail)\.com$/i.test(host)
      ? env.SMTP_PASS?.replace(/\s+/g, '')
      : env.SMTP_PASS
  if (!host || !user || !pass) return null

  const port = Number(env.SMTP_PORT?.trim() || 465)
  if (!Number.isInteger(port) || port <= 0) return null

  const secureEnv = env.SMTP_SECURE?.trim().toLowerCase()
  const secure = secureEnv ? secureEnv === 'true' : port === 465

  return { host, port, secure, user, pass, from: env.SMTP_FROM?.trim() || user }
}

export interface CorreoSaliente {
  to: string
  subject: string
  text: string
  html: string
  attachments?: { filename: string; content: Uint8Array; contentType: string }[]
}

/** Manda un correo. Lanza si el servidor SMTP lo rechaza o no responde. */
export async function enviarCorreo(config: ConfigSmtp, correo: CorreoSaliente): Promise<void> {
  const transporte = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    // Sin límite, un servidor que no responde deja colgado el marcado del pago.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })

  await transporte.sendMail({
    from: config.from,
    to: correo.to,
    subject: correo.subject,
    text: correo.text,
    html: correo.html,
    attachments: correo.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content),
      contentType: a.contentType,
    })),
  })
}
