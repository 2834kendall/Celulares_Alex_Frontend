/**
 * PDF de los comprobantes que se le adjuntan al empleado por correo al pagar
 * (ver lib/envioComprobante.ts):
 *  - planilla: el de /comprobante/[periodo]/[detalle], con las líneas de
 *    armarContenidoComprobante;
 *  - aguinaldo y liquidación: el de /comprobante/extraordinario/[pagoId], con
 *    las de armarComprobanteExtraordinario.
 * Cada PDF sale de la misma función que su página, así el papel impreso y el
 * adjunto nunca muestran rubros distintos.
 *
 * La letra va embebida (DejaVu Sans, en assets/fonts) porque las fuentes
 * estándar de PDF no traen el símbolo del colón (₡).
 */

import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { DetalleNominaItem, PagoExtraordinario, PeriodoDetalle } from '@/modules/payroll/types'
import type { ContenidoComprobante } from '@/modules/payroll/lib/comprobanteContenido'
import type { ContenidoComprobanteExtraordinario } from '@/modules/payroll/lib/comprobanteExtraordinarioContenido'
import { formatCRC, formatDate, formatHoras, periodoLabel } from '@/modules/payroll/lib/format'

export interface DatosComprobantePdf {
  empresaNombre: string
  periodo: Pick<
    PeriodoDetalle,
    'mes' | 'anio' | 'quincena' | 'fechaInicio' | 'fechaFin' | 'sucursalNombre'
  >
  detalle: Pick<
    DetalleNominaItem,
    | 'empleadoNombre'
    | 'empleadoCedula'
    | 'fechaPago'
    | 'horasTrabajadas'
    | 'horasExtra'
    | 'salarioPorHora'
    | 'montosPorConcepto'
    | 'salarioBruto'
    | 'totalDeducciones'
    | 'salarioNeto'
    | 'totalAPagar'
    | 'incapacidad'
    | 'codigoVerificacion'
  >
  contenido: ContenidoComprobante
}

export interface DatosComprobanteExtraordinarioPdf {
  empresaNombre: string
  pago: Pick<
    PagoExtraordinario,
    | 'empleadoNombre'
    | 'empleadoCedula'
    | 'fechaPago'
    | 'montoBruto'
    | 'montoNeto'
    | 'codigoVerificacion'
  >
  contenido: ContenidoComprobanteExtraordinario
}

const DIR_FUENTES = path.join(process.cwd(), 'src/modules/payroll/assets/fonts')

let fuentes: Promise<{ normal: Uint8Array; negrita: Uint8Array }> | null = null

/** Las fuentes se leen una sola vez por proceso. */
function leerFuentes() {
  fuentes ??= Promise.all([
    readFile(path.join(DIR_FUENTES, 'DejaVuSans.ttf')),
    readFile(path.join(DIR_FUENTES, 'DejaVuSans-Bold.ttf')),
  ])
    // Copia a un Uint8Array común: pdf-lib valida el tipo con instanceof y un
    // Buffer de Node no siempre pasa (en los tests con jsdom fallaba).
    .then(([normal, negrita]) => ({
      normal: Uint8Array.from(normal),
      negrita: Uint8Array.from(negrita),
    }))
    .catch((error: unknown) => {
      // Sin cache del fallo: el próximo envío lo vuelve a intentar.
      fuentes = null
      throw error
    })
  return fuentes
}

// Tamaño carta, márgenes de 1,8 cm.
const ANCHO = 612
const ALTO = 792
const MARGEN = 51
const ANCHO_UTIL = ANCHO - MARGEN * 2

const COLOR = {
  titulo: rgb(0.06, 0.09, 0.16), // slate-900
  texto: rgb(0.28, 0.33, 0.41), // slate-600
  suave: rgb(0.39, 0.45, 0.55), // slate-500
  rotulo: rgb(0.58, 0.64, 0.72), // slate-400
  linea: rgb(0.89, 0.91, 0.94), // slate-200
  netoFondo: rgb(0.93, 0.99, 0.96), // emerald-50
  netoTexto: rgb(0.02, 0.37, 0.27), // emerald-800
}

/** Monto con signo de resta, como en la página del comprobante. */
function menos(monto: number) {
  return `− ${formatCRC(monto)}`
}

/**
 * Hoja con las piezas de dibujo que comparten los dos comprobantes: textos,
 * rótulos, líneas de monto, separadores, el total destacado y el código.
 * `y` es la altura donde va lo siguiente; baja a medida que se dibuja y pasa
 * a otra hoja sola cuando no cabe.
 */
class Lienzo {
  y = ALTO - MARGEN
  private pagina: PDFPage

  private constructor(
    private readonly pdf: PDFDocument,
    readonly normal: PDFFont,
    readonly negrita: PDFFont
  ) {
    this.pagina = pdf.addPage([ANCHO, ALTO])
  }

  static async crear(titulo: string, autor: string) {
    const bytes = await leerFuentes()
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    pdf.setTitle(titulo)
    pdf.setAuthor(autor)
    pdf.setCreator('SGRH')
    const normal = await pdf.embedFont(bytes.normal, { subset: true })
    const negrita = await pdf.embedFont(bytes.negrita, { subset: true })
    return new Lienzo(pdf, normal, negrita)
  }

  guardar() {
    return this.pdf.save()
  }

  /** Cambia los caracteres que la fuente no tiene, en vez de dejar un cuadro vacío. */
  limpiar(texto: string, fuente: PDFFont) {
    const disponibles = new Set(fuente.getCharacterSet())
    return Array.from(texto)
      .map((c) => (disponibles.has(c.codePointAt(0)!) ? c : '?'))
      .join('')
  }

  /** Pasa a una hoja nueva si lo que sigue no cabe. */
  espacio(alto: number) {
    if (this.y - alto >= MARGEN) return
    this.pagina = this.pdf.addPage([ANCHO, ALTO])
    this.y = ALTO - MARGEN
  }

  texto(
    valor: string,
    x: number,
    opciones: { fuente?: PDFFont; tamano?: number; color?: RGB; derecha?: boolean } = {}
  ) {
    const fuente = opciones.fuente ?? this.normal
    const tamano = opciones.tamano ?? 10
    const limpio = this.limpiar(valor, fuente)
    const ancho = fuente.widthOfTextAtSize(limpio, tamano)
    this.pagina.drawText(limpio, {
      x: opciones.derecha ? x - ancho : x,
      y: this.y,
      size: tamano,
      font: fuente,
      color: opciones.color ?? COLOR.texto,
    })
  }

  /** Corta un texto en renglones que quepan en `ancho`. */
  renglones(valor: string, fuente: PDFFont, tamano: number, ancho: number) {
    const lineas: string[] = []
    let actual = ''
    for (const palabra of this.limpiar(valor, fuente).split(' ')) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (actual && fuente.widthOfTextAtSize(prueba, tamano) > ancho) {
        lineas.push(actual)
        actual = palabra
      } else {
        actual = prueba
      }
    }
    if (actual) lineas.push(actual)
    return lineas
  }

  /** Párrafo chico que ocupa todo el ancho (notas al pie de un bloque). */
  nota(valor: string) {
    for (const renglon of this.renglones(valor, this.normal, 8, ANCHO_UTIL)) {
      this.espacio(12)
      this.texto(renglon, MARGEN, { tamano: 8, color: COLOR.rotulo })
      this.y -= 11
    }
    this.y -= 3
  }

  separador(margenArriba = 6, margenAbajo = 14) {
    this.y -= margenArriba
    this.pagina.drawLine({
      start: { x: MARGEN, y: this.y },
      end: { x: ANCHO - MARGEN, y: this.y },
      thickness: 0.75,
      color: COLOR.linea,
    })
    this.y -= margenAbajo
  }

  rotulo(valor: string, x = MARGEN) {
    this.texto(valor.toUpperCase(), x, { fuente: this.negrita, tamano: 7.5, color: COLOR.rotulo })
  }

  /** Rótulo de un bloque (Ingresos, Deducciones...) con su espacio debajo. */
  bloque(valor: string) {
    this.espacio(40)
    this.rotulo(valor)
    this.y -= 18
  }

  linea(label: string, valor: string, opciones: { fuerte?: boolean; tenue?: boolean } = {}) {
    const fuente = opciones.fuerte ? this.negrita : this.normal
    const color = opciones.fuerte ? COLOR.titulo : opciones.tenue ? COLOR.rotulo : COLOR.texto
    const tamano = opciones.fuerte ? 10.5 : 10
    // Un rubro con explicación larga ("Preaviso: no aplica por…") se corta en
    // renglones para no pisar el monto de la derecha.
    const anchoMonto = fuente.widthOfTextAtSize(this.limpiar(valor, fuente), tamano)
    const renglones = this.renglones(label, fuente, tamano, ANCHO_UTIL - anchoMonto - 16)
    this.espacio(16 + (renglones.length - 1) * 13)
    this.texto(valor, ANCHO - MARGEN, { fuente, tamano, color, derecha: true })
    renglones.forEach((renglon, i) => {
      if (i > 0) this.y -= 13
      this.texto(renglon, MARGEN, { fuente, tamano, color })
    })
    this.y -= 17
  }

  vacio(mensaje: string) {
    this.texto(mensaje, MARGEN, { tamano: 9, color: COLOR.rotulo })
    this.y -= 17
  }

  totalDestacado(label: string, valor: string) {
    this.espacio(30)
    const alto = 26
    this.pagina.drawRectangle({
      x: MARGEN,
      y: this.y - 9,
      width: ANCHO_UTIL,
      height: alto,
      color: COLOR.netoFondo,
    })
    const estilo = { fuente: this.negrita, tamano: 12, color: COLOR.netoTexto }
    this.texto(label, MARGEN + 10, estilo)
    this.texto(valor, ANCHO - MARGEN - 10, { ...estilo, derecha: true })
    this.y -= alto + 6
  }

  /** Columna de datos con rótulo arriba (empleado, periodo, horas). Devuelve el alto usado. */
  columna(x: number, titulo: string, valor: string, nota?: string, anchoNota = 150) {
    const yInicial = this.y
    this.rotulo(titulo, x)
    this.y -= 14
    this.texto(valor, x, { fuente: this.negrita, tamano: 10.5, color: COLOR.titulo })
    if (nota) {
      for (const renglon of this.renglones(nota, this.normal, 8, anchoNota)) {
        this.y -= 12
        this.texto(renglon, x, { tamano: 8, color: COLOR.suave })
      }
    }
    const usado = yInicial - this.y
    this.y = yInicial
    return usado
  }

  encabezado(empresaNombre: string, titulo: string, subtitulo: string) {
    this.rotulo(empresaNombre)
    this.y -= 22
    this.texto(titulo, MARGEN, { fuente: this.negrita, tamano: 18, color: COLOR.titulo })
    this.y -= 16
    this.texto(subtitulo, MARGEN, { tamano: 9.5, color: COLOR.suave })
    this.separador(14, 20)
  }

  codigoVerificacion(codigo: string) {
    this.espacio(40)
    this.separador(14, 16)
    this.texto('Código de verificación', MARGEN, { tamano: 8.5, color: COLOR.suave })
    this.texto(codigo, ANCHO - MARGEN, {
      fuente: this.negrita,
      tamano: 10,
      color: COLOR.titulo,
      derecha: true,
    })
    this.y -= 12
  }
}

const MITAD = MARGEN + ANCHO_UTIL / 2

export async function generarComprobantePdf(datos: DatosComprobantePdf): Promise<Uint8Array> {
  const { empresaNombre, periodo, detalle, contenido } = datos
  const h = await Lienzo.crear(`Comprobante de pago · ${detalle.empleadoNombre}`, empresaNombre)

  h.encabezado(
    empresaNombre,
    'Comprobante de pago',
    `${periodoLabel(periodo.mes, periodo.anio, periodo.quincena)} · ${periodo.sucursalNombre}`
  )

  // ── Empleado y periodo ──────────────────────────────────────────────────
  const altoEmpleado = h.columna(MARGEN, 'Empleado', detalle.empleadoNombre, detalle.empleadoCedula)
  const altoPeriodo = h.columna(
    MITAD,
    'Periodo pagado',
    `${formatDate(periodo.fechaInicio)} — ${formatDate(periodo.fechaFin)}`,
    `Fecha de pago: ${formatDate(detalle.fechaPago)}`
  )
  h.y -= Math.max(altoEmpleado, altoPeriodo)
  h.separador(10, 20)

  // ── Horas ───────────────────────────────────────────────────────────────
  // Van impresas porque son de dónde sale el monto (igual que en la página).
  const tercio = ANCHO_UTIL / 3
  const notaExtra =
    detalle.horasExtra > 0
      ? (detalle.montosPorConcepto.HORAS_EXTRA ?? 0) > 0
        ? 'Pagadas desde el banco de horas: el monto va en ingresos.'
        : 'En el banco de horas: no se pagan en este comprobante.'
      : undefined
  const altos = [
    h.columna(MARGEN, 'Horas trabajadas', `${formatHoras(detalle.horasTrabajadas)} h`),
    h.columna(
      MARGEN + tercio,
      'Horas extra',
      detalle.horasExtra > 0 ? `${formatHoras(detalle.horasExtra)} h` : '—',
      notaExtra,
      tercio - 12
    ),
    h.columna(MARGEN + tercio * 2, 'Valor de la hora', formatCRC(detalle.salarioPorHora)),
  ]
  h.y -= Math.max(...altos)
  h.separador(10, 22)

  // ── Ingresos ────────────────────────────────────────────────────────────
  h.bloque('Ingresos')
  if (contenido.ingresos.length === 0) h.vacio('Sin ingresos registrados.')
  for (const l of contenido.ingresos) {
    h.linea(l.label, l.value < 0 ? menos(-l.value) : formatCRC(l.value))
  }
  h.separador(0, 16)
  h.linea('Salario bruto', formatCRC(detalle.salarioBruto), { fuerte: true })

  // ── Deducciones ─────────────────────────────────────────────────────────
  h.y -= 10
  h.bloque('Deducciones')
  if (contenido.deducciones.length === 0) h.vacio('Sin deducciones registradas.')
  for (const l of contenido.deducciones) {
    h.linea(l.label, menos(l.value))
  }
  h.separador(0, 16)
  h.linea('Total deducciones', menos(detalle.totalDeducciones), { fuerte: true })

  // ── Otros pagos (no salariales) ─────────────────────────────────────────
  if (contenido.noSalarial.length > 0) {
    h.linea('Subtotal', formatCRC(contenido.subtotal))
    h.y -= 10
    h.bloque('Otros pagos')
    for (const l of contenido.noSalarial) {
      h.linea(l.label, formatCRC(l.value))
    }
    h.nota('No son salario: no se les rebaja CCSS y no cuentan para el aguinaldo.')
  }

  h.separador(0, 18)

  // ── Neto (e incapacidad) ────────────────────────────────────────────────
  if (detalle.incapacidad) {
    h.linea('Salario neto', formatCRC(detalle.salarioNeto), { fuerte: true })
    h.y -= 10
    h.espacio(80)
    h.bloque(detalle.incapacidad.tipoNombre ?? 'Incapacidad')
    h.linea(
      `Días pagados por la empresa (${detalle.incapacidad.porcentajePagoEmpleador}% del salario)`,
      `${detalle.incapacidad.diasEmpleador} día(s)`
    )
    if (detalle.incapacidad.diasCcss > 0) {
      h.linea('Días pagados por la CCSS', `${detalle.incapacidad.diasCcss} día(s)`)
    }
    h.separador(0, 16)
    h.linea('Monto que paga la empresa', formatCRC(detalle.incapacidad.monto), { fuerte: true })
    h.separador(0, 20)
    h.totalDestacado('Total a pagar', formatCRC(detalle.totalAPagar))
  } else {
    h.y -= 2
    h.totalDestacado('Salario neto pagado', formatCRC(detalle.totalAPagar))
  }

  if (detalle.codigoVerificacion) h.codigoVerificacion(detalle.codigoVerificacion)

  return h.guardar()
}

/** Comprobante de un pago de aguinaldo o de liquidación (lo que quedó congelado al pagar). */
export async function generarComprobanteExtraordinarioPdf(
  datos: DatosComprobanteExtraordinarioPdf
): Promise<Uint8Array> {
  const { empresaNombre, pago, contenido } = datos
  const h = await Lienzo.crear(`${contenido.titulo} · ${pago.empleadoNombre}`, empresaNombre)

  h.encabezado(empresaNombre, contenido.titulo, contenido.subtitulo)

  const altoEmpleado = h.columna(MARGEN, 'Empleado', pago.empleadoNombre, pago.empleadoCedula)
  const altoFecha = h.columna(MITAD, 'Fecha de pago', formatDate(pago.fechaPago))
  h.y -= Math.max(altoEmpleado, altoFecha)
  h.separador(10, 22)

  if (contenido.informativas.length > 0) {
    h.bloque('Cálculo')
    for (const l of contenido.informativas) {
      h.linea(l.label, formatCRC(l.monto), { tenue: true })
    }
    h.separador(0, 22)
  }

  h.bloque('Rubros')
  for (const l of contenido.rubros) {
    h.linea(l.label, formatCRC(l.monto))
  }
  h.separador(0, 16)
  h.linea('Total bruto', formatCRC(pago.montoBruto), { fuerte: true })

  if (contenido.deducciones.length > 0) {
    h.y -= 10
    h.bloque('Deducciones')
    for (const l of contenido.deducciones) {
      h.linea(l.label, menos(l.monto))
    }
  }
  h.y -= 2
  h.nota(contenido.nota)

  h.separador(0, 18)
  h.totalDestacado('Neto pagado', formatCRC(pago.montoNeto))

  h.codigoVerificacion(pago.codigoVerificacion)

  return h.guardar()
}
