import { describe, expect, it } from 'vitest'
import { armarComprobanteExtraordinario } from './comprobanteExtraordinarioContenido'

describe('armarComprobanteExtraordinario', () => {
  it('aguinaldo: título del año, el ciclo que cubre y la nota de exención', () => {
    const c = armarComprobanteExtraordinario({
      tipo: 'aguinaldo',
      anioAguinaldo: 2026,
      fechaSalida: null,
      motivoSalida: null,
      lineas: [
        { concepto: 'Salarios del ciclo', dias: null, monto: 5160000, informativo: true },
        { concepto: 'Aguinaldo', dias: null, monto: 430000 },
      ],
    })

    expect(c.titulo).toBe('Comprobante de pago del aguinaldo 2026')
    expect(c.subtitulo).toBe('Cubre del 1 de diciembre de 2025 al 30 de noviembre de 2026')
    expect(c.informativas).toEqual([{ label: 'Salarios del ciclo', monto: 5160000 }])
    expect(c.rubros).toEqual([{ label: 'Aguinaldo', monto: 430000 }])
    expect(c.deducciones).toEqual([])
    expect(c.nota).toContain('Ley 2412')
  })

  it('liquidación: la salida con su motivo, los días de cada rubro y las deducciones con monto', () => {
    const c = armarComprobanteExtraordinario({
      tipo: 'liquidacion',
      anioAguinaldo: null,
      fechaSalida: '2026-09-10',
      motivoSalida: 'Renuncia',
      lineas: [
        { concepto: 'Preaviso', dias: 30, monto: 430000 },
        { concepto: 'Aguinaldo proporcional', dias: null, monto: 100000 },
        { concepto: 'CCSS obrera', dias: null, monto: 21660, deduccion: true },
        { concepto: 'Otra deducción', dias: null, monto: 0, deduccion: true },
      ],
    })

    expect(c.titulo).toBe('Comprobante de liquidación')
    expect(c.subtitulo).toBe('Salida: 10/09/2026 · Renuncia')
    expect(c.rubros).toEqual([
      { label: 'Preaviso (30 días)', monto: 430000 },
      { label: 'Aguinaldo proporcional', monto: 100000 },
    ])
    expect(c.deducciones).toEqual([{ label: 'CCSS obrera', monto: 21660 }])
    expect(c.nota).toContain('no llevan cuota obrera')
  })
})
