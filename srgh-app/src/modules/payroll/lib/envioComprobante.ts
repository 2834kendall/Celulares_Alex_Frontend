/**
 * Envío del comprobante de pago al correo del empleado, con el PDF adjunto.
 *
 * Se dispara al pagar —una fila de planilla (marcarDetallePagado), un
 * aguinaldo (pagarAguinaldo) o una liquidación (pagarLiquidacion)— y desde el
 * botón "Reintentar" si el envío falló (reenviarComprobante). Nunca deshace
 * el pago: si el correo no sale, el pago queda registrado igual y se avisa
 * por qué no se envió.
 */

import 'server-only'
import { getPeriodoDetail } from '@/modules/payroll/actions/getPeriodoDetail'
import { getConceptos } from '@/modules/payroll/actions/getConceptos'
import { getPagoExtraordinario } from '@/modules/payroll/actions/getPagoExtraordinario'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { configSmtp, enviarCorreo, type ConfigSmtp } from '@/lib/correo/smtp'
import { armarContenidoComprobante } from '@/modules/payroll/lib/comprobanteContenido'
import { armarComprobanteExtraordinario } from '@/modules/payroll/lib/comprobanteExtraordinarioContenido'
import {
  generarComprobanteExtraordinarioPdf,
  generarComprobantePdf,
} from '@/modules/payroll/lib/comprobantePdf'
import { formatCRC, formatDate, periodoLabel } from '@/modules/payroll/lib/format'

export type ResultadoEnvioComprobante =
  | { estado: 'enviado'; email: string }
  | { estado: 'sin_email' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; error: string }

/** Formato mínimo de una dirección: algo@algo.algo, sin espacios. */
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Mensaje para el encargado según el error de nodemailer. */
function motivoDelFallo(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  if (code === 'EAUTH') {
    return 'el servidor de correo rechazó el usuario o la contraseña (revisá SMTP_USER y SMTP_PASS).'
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') {
    return 'no se pudo conectar con el servidor de correo.'
  }
  if (code === 'EENVELOPE') {
    return 'el servidor de correo rechazó la dirección del empleado.'
  }
  return 'el servidor de correo no lo aceptó.'
}

/** La cédula sin guiones ni espacios, para el nombre del archivo. */
function idArchivo(cedula: string) {
  return cedula.replace(/[^0-9A-Za-z]/g, '') || 'empleado'
}

/** Revisa la dirección antes de armar nada: sin correo válido no hay envío. */
function revisarEmail(
  email: string | null
): { ok: true; email: string } | { ok: false; resultado: ResultadoEnvioComprobante } {
  if (!email) return { ok: false, resultado: { estado: 'sin_email' } }
  if (!EMAIL_VALIDO.test(email)) {
    return {
      ok: false,
      resultado: {
        estado: 'error',
        error: `el correo registrado del empleado (${email}) no es una dirección válida.`,
      },
    }
  }
  return { ok: true, email }
}

async function generarPdf(generar: () => Promise<Uint8Array>) {
  try {
    return await generar()
  } catch (error) {
    console.error('[comprobante] no se pudo generar el PDF', error)
    return null
  }
}

interface CorreoComprobante {
  config: ConfigSmtp
  email: string
  empleadoNombre: string
  empresaNombre: string
  asunto: string
  /** Qué se pagó, para la frase "Registramos el pago de su …". */
  queSePago: string
  /** Filas del resumen; la marcada como total va destacada. */
  resumen: { label: string; valor: string; total?: boolean }[]
  archivo: string
  pdf: Uint8Array
}

/** Arma el correo (texto y HTML) con el resumen y el PDF adjunto, y lo manda. */
async function mandarComprobante(c: CorreoComprobante): Promise<ResultadoEnvioComprobante> {
  const text = [
    `Hola ${c.empleadoNombre}:`,
    '',
    `${c.empresaNombre} registró el pago de su ${c.queSePago}. Le adjuntamos el comprobante en PDF.`,
    '',
    ...c.resumen.map((r) => `${r.label}: ${r.valor}`),
    '',
    'Si algo no coincide con lo que recibió, comuníquese con el encargado de planillas.',
  ].join('\n')

  const filas = c.resumen
    .map((r, i) => {
      const estilo = r.total
        ? 'font-weight:700;color:#065f46;background:#ecfdf5;'
        : 'color:#334155;'
      const borde = i > 0 ? 'border-top:1px solid #e2e8f0;' : ''
      return `<tr><td style="padding:6px 10px;${estilo}${borde}">${escaparHtml(r.label)}</td><td style="padding:6px 10px;text-align:right;${estilo}${borde}">${escaparHtml(r.valor)}</td></tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
<p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;">${escaparHtml(c.empresaNombre)}</p>
<h1 style="margin:0 0 16px;font-size:18px;">Comprobante de pago</h1>
<p style="margin:0 0 12px;">Hola ${escaparHtml(c.empleadoNombre)}:</p>
<p style="margin:0 0 16px;line-height:1.5;">Registramos el pago de su <strong>${escaparHtml(c.queSePago)}</strong>. Le adjuntamos el comprobante completo en PDF.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;">${filas}</table>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748b;">Si algo no coincide con lo que recibió, comuníquese con el encargado de planillas.</p>
</div></body></html>`

  try {
    await enviarCorreo(c.config, {
      to: c.email,
      subject: c.asunto,
      text,
      html,
      attachments: [{ filename: c.archivo, content: c.pdf, contentType: 'application/pdf' }],
    })
  } catch (error) {
    console.error('[comprobante] no se pudo enviar el correo', error)
    return { estado: 'error', error: motivoDelFallo(error) }
  }

  return { estado: 'enviado', email: c.email }
}

const ERROR_PDF: ResultadoEnvioComprobante = {
  estado: 'error',
  error: 'no se pudo generar el PDF del comprobante.',
}

/** Comprobante de una fila de planilla ya marcada como pagada. */
export async function enviarComprobantePorCorreo(
  periodoId: number,
  detalleId: number
): Promise<ResultadoEnvioComprobante> {
  const config = configSmtp()
  if (!config) return { estado: 'sin_configurar' }

  const [detailResult, conceptosResult, empresaNombre] = await Promise.all([
    getPeriodoDetail(periodoId),
    getConceptos(),
    getEmpresaNombre(),
  ])

  if (!detailResult.ok) {
    return { estado: 'error', error: 'no se pudo cargar el pago para armar el comprobante.' }
  }
  if (!conceptosResult.ok) {
    return {
      estado: 'error',
      error: 'no se pudieron cargar los conceptos para armar el comprobante.',
    }
  }

  const periodo = detailResult.data
  const detalle = periodo.detalles.find((d) => d.id === detalleId)
  if (!detalle) {
    return { estado: 'error', error: 'no se encontró la fila del pago.' }
  }
  if (!detalle.pagado) {
    return { estado: 'error', error: 'el pago ya no está marcado como pagado.' }
  }

  const destino = revisarEmail(detalle.empleadoEmail)
  if (!destino.ok) return destino.resultado

  const contenido = armarContenidoComprobante(detalle, conceptosResult.data)
  const pdf = await generarPdf(() =>
    generarComprobantePdf({ empresaNombre, periodo, detalle, contenido })
  )
  if (!pdf) return ERROR_PDF

  const etiqueta = periodoLabel(periodo.mes, periodo.anio, periodo.quincena)
  const resumen: CorreoComprobante['resumen'] = [
    {
      label: 'Periodo',
      valor: `${etiqueta} (${formatDate(periodo.fechaInicio)} — ${formatDate(periodo.fechaFin)})`,
    },
    { label: 'Fecha de pago', valor: formatDate(detalle.fechaPago) },
    { label: 'Salario bruto', valor: formatCRC(detalle.salarioBruto) },
    { label: 'Deducciones', valor: `− ${formatCRC(detalle.totalDeducciones)}` },
  ]
  if (detalle.incapacidad) {
    resumen.push({ label: 'Incapacidad (empresa)', valor: formatCRC(detalle.incapacidad.monto) })
  }
  resumen.push({ label: 'Total pagado', valor: formatCRC(detalle.totalAPagar), total: true })
  if (detalle.codigoVerificacion) {
    resumen.push({ label: 'Código de verificación', valor: detalle.codigoVerificacion })
  }

  return mandarComprobante({
    config,
    email: destino.email,
    empleadoNombre: detalle.empleadoNombre,
    empresaNombre,
    asunto: `Comprobante de pago · ${etiqueta} · ${empresaNombre}`,
    queSePago: `planilla de ${etiqueta}`,
    resumen,
    archivo: `comprobante-${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-q${periodo.quincena}-${idArchivo(detalle.empleadoCedula)}.pdf`,
    pdf,
  })
}

/** Comprobante de un pago de aguinaldo o de liquidación (sgrh_pagos_extraordinarios). */
export async function enviarComprobanteExtraordinarioPorCorreo(
  pagoId: number
): Promise<ResultadoEnvioComprobante> {
  const config = configSmtp()
  if (!config) return { estado: 'sin_configurar' }

  const [pagoResult, empresaNombre] = await Promise.all([
    getPagoExtraordinario(pagoId),
    getEmpresaNombre(),
  ])
  if (!pagoResult.ok) {
    return { estado: 'error', error: 'no se pudo cargar el pago para armar el comprobante.' }
  }
  const pago = pagoResult.data

  const destino = revisarEmail(pago.empleadoEmail)
  if (!destino.ok) return destino.resultado

  const contenido = armarComprobanteExtraordinario(pago)
  const pdf = await generarPdf(() =>
    generarComprobanteExtraordinarioPdf({ empresaNombre, pago, contenido })
  )
  if (!pdf) return ERROR_PDF

  const esAguinaldo = pago.tipo === 'aguinaldo'
  const resumen: CorreoComprobante['resumen'] = [
    {
      label: esAguinaldo ? 'Periodo' : 'Salida',
      valor: contenido.subtitulo.replace(/^Salida: /, '').replace(/^Cubre del /, 'Del '),
    },
    { label: 'Fecha de pago', valor: formatDate(pago.fechaPago) },
    { label: 'Total bruto', valor: formatCRC(pago.montoBruto) },
  ]
  if (pago.deducciones > 0) {
    resumen.push({ label: 'Deducciones', valor: `− ${formatCRC(pago.deducciones)}` })
  }
  resumen.push({ label: 'Neto pagado', valor: formatCRC(pago.montoNeto), total: true })
  resumen.push({ label: 'Código de verificación', valor: pago.codigoVerificacion })

  const id = idArchivo(pago.empleadoCedula)
  return mandarComprobante({
    config,
    email: destino.email,
    empleadoNombre: pago.empleadoNombre,
    empresaNombre,
    asunto: `${contenido.titulo} · ${empresaNombre}`,
    queSePago: esAguinaldo
      ? pago.anioAguinaldo
        ? `aguinaldo ${pago.anioAguinaldo}`
        : 'aguinaldo'
      : 'liquidación laboral',
    resumen,
    archivo: esAguinaldo
      ? `aguinaldo-${pago.anioAguinaldo ?? pago.fechaPago.slice(0, 4)}-${id}.pdf`
      : `liquidacion-${pago.fechaSalida ?? pago.fechaPago}-${id}.pdf`,
    pdf,
  })
}
