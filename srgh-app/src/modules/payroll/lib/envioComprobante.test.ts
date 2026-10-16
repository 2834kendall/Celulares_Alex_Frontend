import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enviarComprobanteExtraordinarioPorCorreo,
  enviarComprobantePorCorreo,
} from './envioComprobante'
import { getPeriodoDetail } from '@/modules/payroll/actions/getPeriodoDetail'
import { getConceptos } from '@/modules/payroll/actions/getConceptos'
import { getPagoExtraordinario } from '@/modules/payroll/actions/getPagoExtraordinario'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { configSmtp, enviarCorreo, type ConfigSmtp } from '@/lib/correo/smtp'
import { formatCRC } from '@/modules/payroll/lib/format'
import type {
  ConceptoNominaRow,
  DetalleNominaItem,
  PagoExtraordinario,
  PeriodoDetalle,
} from '@/modules/payroll/types'

vi.mock('server-only', () => ({}))
vi.mock('@/modules/payroll/actions/getPeriodoDetail', () => ({ getPeriodoDetail: vi.fn() }))
vi.mock('@/modules/payroll/actions/getConceptos', () => ({ getConceptos: vi.fn() }))
vi.mock('@/modules/payroll/actions/getPagoExtraordinario', () => ({
  getPagoExtraordinario: vi.fn(),
}))
vi.mock('@/lib/empresa/get-empresa-nombre', () => ({ getEmpresaNombre: vi.fn() }))
vi.mock('@/lib/correo/smtp', () => ({ configSmtp: vi.fn(), enviarCorreo: vi.fn() }))

const CONFIG: ConfigSmtp = {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  user: 'planillas@empresa.com',
  pass: 'x',
  from: 'planillas@empresa.com',
}

const CONCEPTOS = [
  {
    con_codigo: 'BASE',
    con_nombre: 'Salario base',
    con_activo: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_afecta_salario_bruto: true,
    con_rebaja_salario: false,
  },
  {
    con_codigo: 'CCSS_OBRERA',
    con_nombre: 'CCSS obrera',
    con_activo: true,
    con_tipo_calculo: 'porcentaje_bruto',
    con_afecta_salario_bruto: false,
    con_rebaja_salario: false,
  },
] as unknown as ConceptoNominaRow[]

const DETALLE = {
  id: 41,
  empleadoNombre: 'Nataly Hidalgo Camacho',
  empleadoCedula: '1-1234-5678',
  empleadoEmail: 'nataly@correo.com',
  pagado: true,
  fechaPago: '2026-09-30',
  horasTrabajadas: 12,
  horasExtra: 0,
  salarioPorHora: 1333.33,
  montosPorConcepto: { BASE: 15483.87, CCSS_OBRERA: 1676.9 },
  salarioBruto: 15483.87,
  totalDeducciones: 1676.9,
  salarioNeto: 13806.97,
  totalAPagar: 13806.97,
  incapacidad: null,
  codigoVerificacion: 'ABCD-EFGH-JKMN',
} as unknown as DetalleNominaItem

function periodoCon(detalle: Partial<DetalleNominaItem> = {}) {
  return {
    id: 7,
    mes: 9,
    anio: 2026,
    quincena: 2,
    fechaInicio: '2026-09-16',
    fechaFin: '2026-09-30',
    sucursalNombre: 'Centro',
    detalles: [{ ...DETALLE, ...detalle }],
  } as unknown as PeriodoDetalle
}

describe('enviarComprobantePorCorreo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(configSmtp).mockReturnValue(CONFIG)
    vi.mocked(getPeriodoDetail).mockResolvedValue({ ok: true, data: periodoCon() })
    vi.mocked(getConceptos).mockResolvedValue({ ok: true, data: CONCEPTOS })
    vi.mocked(getEmpresaNombre).mockResolvedValue('Celulares Alex')
    vi.mocked(enviarCorreo).mockResolvedValue()
  })

  it('le manda al empleado el resumen y el comprobante en PDF', async () => {
    const r = await enviarComprobantePorCorreo(7, 41)

    expect(r).toEqual({ estado: 'enviado', email: 'nataly@correo.com' })
    // Solo la fila del pago, no el periodo entero.
    expect(getPeriodoDetail).toHaveBeenCalledWith(7, { soloDetalleId: 41 })
    const [config, correo] = vi.mocked(enviarCorreo).mock.calls[0]
    expect(config).toBe(CONFIG)
    expect(correo.to).toBe('nataly@correo.com')
    expect(correo.subject).toBe(
      'Comprobante de pago · Septiembre 2026 · 2ª quincena · Celulares Alex'
    )
    // Resumen: lo que el empleado necesita ver sin abrir el adjunto.
    expect(correo.text).toContain(`Salario bruto: ${formatCRC(15483.87)}`)
    expect(correo.text).toContain(`Deducciones: − ${formatCRC(1676.9)}`)
    expect(correo.text).toContain(`Total pagado: ${formatCRC(13806.97)}`)
    expect(correo.text).toContain('Código de verificación: ABCD-EFGH-JKMN')
    expect(correo.html).toContain('Nataly Hidalgo Camacho')

    const adjunto = correo.attachments![0]
    expect(adjunto.filename).toBe('comprobante-2026-09-q2-112345678.pdf')
    expect(adjunto.contentType).toBe('application/pdf')
    expect(new TextDecoder().decode(adjunto.content.slice(0, 5))).toBe('%PDF-')
  })

  it('el nombre del empleado no puede meter HTML en el correo', async () => {
    vi.mocked(getPeriodoDetail).mockResolvedValue({
      ok: true,
      data: periodoCon({ empleadoNombre: 'Ana <b>Mora</b>' }),
    })

    await enviarComprobantePorCorreo(7, 41)

    const html = vi.mocked(enviarCorreo).mock.calls[0][1].html
    expect(html).toContain('Ana &lt;b&gt;Mora&lt;/b&gt;')
    expect(html).not.toContain('<b>Mora</b>')
  })

  it('sin SMTP configurado no intenta nada', async () => {
    vi.mocked(configSmtp).mockReturnValue(null)

    expect(await enviarComprobantePorCorreo(7, 41)).toEqual({ estado: 'sin_configurar' })
    expect(getPeriodoDetail).not.toHaveBeenCalled()
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('un empleado sin correo registrado no recibe nada, y se dice', async () => {
    vi.mocked(getPeriodoDetail).mockResolvedValue({
      ok: true,
      data: periodoCon({ empleadoEmail: null }),
    })

    expect(await enviarComprobantePorCorreo(7, 41)).toEqual({ estado: 'sin_email' })
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('un correo mal escrito no se intenta mandar', async () => {
    vi.mocked(getPeriodoDetail).mockResolvedValue({
      ok: true,
      data: periodoCon({ empleadoEmail: 'nataly.correo.com' }),
    })

    const r = await enviarComprobantePorCorreo(7, 41)

    expect(r.estado).toBe('error')
    expect(r.estado === 'error' && r.error).toContain('nataly.correo.com')
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('no manda el comprobante de un pago que ya no está marcado', async () => {
    vi.mocked(getPeriodoDetail).mockResolvedValue({ ok: true, data: periodoCon({ pagado: false }) })

    const r = await enviarComprobantePorCorreo(7, 41)

    expect(r).toEqual({ estado: 'error', error: 'el pago ya no está marcado como pagado.' })
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('si el servidor rechaza la contraseña dice qué variables revisar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(enviarCorreo).mockRejectedValue(Object.assign(new Error('x'), { code: 'EAUTH' }))

    const r = await enviarComprobantePorCorreo(7, 41)

    expect(r.estado).toBe('error')
    expect(r.estado === 'error' && r.error).toContain('SMTP_USER y SMTP_PASS')
  })

  it('si no se puede conectar con el servidor lo dice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(enviarCorreo).mockRejectedValue(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))

    const r = await enviarComprobantePorCorreo(7, 41)

    expect(r).toEqual({ estado: 'error', error: 'no se pudo conectar con el servidor de correo.' })
  })
})

const AGUINALDO: PagoExtraordinario = {
  id: 9,
  tipo: 'aguinaldo',
  empleadoNombre: 'Ana Mora',
  empleadoCedula: '1-1111-1111',
  empleadoEmail: 'ana@correo.com',
  anioAguinaldo: 2026,
  liquidacionId: null,
  fechaSalida: null,
  motivoSalida: null,
  montoBruto: 430000,
  deducciones: 0,
  montoNeto: 430000,
  lineas: [
    { concepto: 'Salarios del ciclo', dias: null, monto: 5160000, informativo: true },
    { concepto: 'Aguinaldo', dias: null, monto: 430000 },
  ],
  fechaPago: '2026-12-15',
  codigoVerificacion: 'WXYZ-2345-6789',
  observaciones: null,
}

const LIQUIDACION: PagoExtraordinario = {
  ...AGUINALDO,
  id: 10,
  tipo: 'liquidacion',
  anioAguinaldo: null,
  liquidacionId: 55,
  fechaSalida: '2026-09-10',
  motivoSalida: 'Despido con responsabilidad patronal',
  montoBruto: 900000,
  deducciones: 21660,
  montoNeto: 878340,
  lineas: [
    { concepto: 'Preaviso', dias: 30, monto: 430000 },
    { concepto: 'Salario pendiente', dias: 10, monto: 200000 },
    { concepto: 'CCSS obrera', dias: null, monto: 21660, deduccion: true },
  ],
  fechaPago: '2026-09-20',
}

describe('enviarComprobanteExtraordinarioPorCorreo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(configSmtp).mockReturnValue(CONFIG)
    vi.mocked(getEmpresaNombre).mockResolvedValue('Celulares Alex')
    vi.mocked(enviarCorreo).mockResolvedValue()
  })

  it('el aguinaldo le llega con su resumen y el comprobante en PDF', async () => {
    vi.mocked(getPagoExtraordinario).mockResolvedValue({ ok: true, data: AGUINALDO })

    const r = await enviarComprobanteExtraordinarioPorCorreo(9)

    expect(r).toEqual({ estado: 'enviado', email: 'ana@correo.com' })
    expect(getPagoExtraordinario).toHaveBeenCalledWith(9)
    const correo = vi.mocked(enviarCorreo).mock.calls[0][1]
    expect(correo.to).toBe('ana@correo.com')
    expect(correo.subject).toBe('Comprobante de pago del aguinaldo 2026 · Celulares Alex')
    expect(correo.text).toContain('registró el pago de su aguinaldo 2026')
    expect(correo.text).toContain(`Neto pagado: ${formatCRC(430000)}`)
    expect(correo.text).toContain('Código de verificación: WXYZ-2345-6789')
    // Exento: sin línea de deducciones en ₡0.
    expect(correo.text).not.toContain('Deducciones')
    const adjunto = correo.attachments![0]
    expect(adjunto.filename).toBe('aguinaldo-2026-111111111.pdf')
    expect(new TextDecoder().decode(adjunto.content.slice(0, 5))).toBe('%PDF-')
  })

  it('la liquidación le llega con la salida, las deducciones y el neto', async () => {
    vi.mocked(getPagoExtraordinario).mockResolvedValue({ ok: true, data: LIQUIDACION })

    const r = await enviarComprobanteExtraordinarioPorCorreo(10)

    expect(r.estado).toBe('enviado')
    const correo = vi.mocked(enviarCorreo).mock.calls[0][1]
    expect(correo.subject).toBe('Comprobante de liquidación · Celulares Alex')
    expect(correo.text).toContain('registró el pago de su liquidación laboral')
    expect(correo.text).toContain('Salida: 10/09/2026 · Despido con responsabilidad patronal')
    expect(correo.text).toContain(`Deducciones: − ${formatCRC(21660)}`)
    expect(correo.text).toContain(`Neto pagado: ${formatCRC(878340)}`)
    expect(correo.attachments![0].filename).toBe('liquidacion-2026-09-10-111111111.pdf')
  })

  it('sin correo registrado no se envía y se dice', async () => {
    vi.mocked(getPagoExtraordinario).mockResolvedValue({
      ok: true,
      data: { ...AGUINALDO, empleadoEmail: null },
    })

    expect(await enviarComprobanteExtraordinarioPorCorreo(9)).toEqual({ estado: 'sin_email' })
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('sin SMTP configurado no intenta nada', async () => {
    vi.mocked(configSmtp).mockReturnValue(null)

    expect(await enviarComprobanteExtraordinarioPorCorreo(9)).toEqual({
      estado: 'sin_configurar',
    })
    expect(getPagoExtraordinario).not.toHaveBeenCalled()
  })

  it('si no se puede leer el pago no manda nada', async () => {
    vi.mocked(getPagoExtraordinario).mockResolvedValue({ ok: false, error: 'x' })

    const r = await enviarComprobanteExtraordinarioPorCorreo(9)

    expect(r.estado).toBe('error')
    expect(enviarCorreo).not.toHaveBeenCalled()
  })
})
