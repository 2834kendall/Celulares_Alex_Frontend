import { describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  generarComprobanteExtraordinarioPdf,
  generarComprobantePdf,
  type DatosComprobantePdf,
} from './comprobantePdf'
import { armarComprobanteExtraordinario } from './comprobanteExtraordinarioContenido'

vi.mock('server-only', () => ({}))

const DATOS: DatosComprobantePdf = {
  empresaNombre: 'Celulares Alex',
  periodo: {
    mes: 9,
    anio: 2026,
    quincena: 2,
    fechaInicio: '2026-09-16',
    fechaFin: '2026-09-30',
    sucursalNombre: 'Centro',
  },
  detalle: {
    empleadoNombre: 'Nataly Hidalgo Camacho',
    empleadoCedula: '1-1234-5678',
    fechaPago: '2026-09-30',
    horasTrabajadas: 12,
    horasExtra: 2,
    salarioPorHora: 1333.33,
    montosPorConcepto: { BASE: 15483.87, CCSS_OBRERA: 1676.9 },
    salarioBruto: 15483.87,
    totalDeducciones: 1676.9,
    salarioNeto: 13806.97,
    totalAPagar: 13806.97,
    incapacidad: null,
    codigoVerificacion: 'ABCD-EFGH-JKMN',
  },
  contenido: {
    ingresos: [{ label: 'Salario base', value: 15483.87 }],
    noSalarial: [],
    deducciones: [{ label: 'CCSS obrera', value: 1676.9 }],
    subtotal: 13806.97,
  },
}

describe('generarComprobantePdf', () => {
  it('arma un PDF válido de una página con su título', async () => {
    const bytes = await generarComprobantePdf(DATOS)

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe('Comprobante de pago · Nataly Hidalgo Camacho')
  })

  it('con incapacidad y muchos rubros no se rompe y pasa a otra hoja si hace falta', async () => {
    const muchas = Array.from({ length: 60 }, (_, i) => ({ label: `Rubro ${i + 1}`, value: 1000 }))
    const bytes = await generarComprobantePdf({
      ...DATOS,
      detalle: {
        ...DATOS.detalle,
        incapacidad: {
          diasEmpleador: 3,
          diasCcss: 2,
          porcentajePagoEmpleador: 50,
          monto: 21500,
          tipoNombre: 'Incapacidad por enfermedad',
        },
      },
      contenido: { ...DATOS.contenido, ingresos: muchas },
    })

    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })

  it('un carácter que la letra no tiene no rompe el PDF', async () => {
    const bytes = await generarComprobantePdf({
      ...DATOS,
      detalle: { ...DATOS.detalle, empleadoNombre: 'Zoë 王 Ŝmith' },
    })

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})

describe('generarComprobanteExtraordinarioPdf', () => {
  it('arma el PDF de una liquidación con su título', async () => {
    const lineas = [
      { concepto: 'Preaviso', dias: 30, monto: 430000 },
      { concepto: 'CCSS obrera', dias: null, monto: 21660, deduccion: true },
    ]
    const bytes = await generarComprobanteExtraordinarioPdf({
      empresaNombre: 'Celulares Alex',
      pago: {
        empleadoNombre: 'Ana Mora',
        empleadoCedula: '1-1111-1111',
        fechaPago: '2026-09-20',
        montoBruto: 430000,
        montoNeto: 408340,
        codigoVerificacion: 'ABCD-EFGH-JKMN',
      },
      contenido: armarComprobanteExtraordinario({
        tipo: 'liquidacion',
        anioAguinaldo: null,
        fechaSalida: '2026-09-10',
        motivoSalida: 'Renuncia',
        lineas,
      }),
    })

    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe('Comprobante de liquidación · Ana Mora')
  })
})
