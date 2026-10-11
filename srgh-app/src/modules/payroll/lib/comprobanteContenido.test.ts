import { describe, expect, it } from 'vitest'
import { armarContenidoComprobante, type ConceptoComprobante } from './comprobanteContenido'

function concepto(
  over: Partial<ConceptoComprobante> & { con_codigo: string }
): ConceptoComprobante {
  return {
    con_nombre: over.con_codigo,
    con_activo: true,
    con_tipo_calculo: 'monto_manual_ingreso',
    con_afecta_salario_bruto: true,
    con_rebaja_salario: false,
    ...over,
  }
}

const CATALOGO = [
  concepto({ con_codigo: 'BASE', con_nombre: 'Salario base' }),
  concepto({ con_codigo: 'FERIADO', con_nombre: 'Feriado' }),
  concepto({ con_codigo: 'VIATICOS', con_nombre: 'Viáticos', con_afecta_salario_bruto: false }),
  concepto({
    con_codigo: 'CCSS_OBRERA',
    con_nombre: 'CCSS obrera',
    con_tipo_calculo: 'porcentaje_bruto',
    con_afecta_salario_bruto: false,
  }),
  concepto({
    con_codigo: 'DED006',
    con_nombre: 'Ausencia sin goce',
    con_tipo_calculo: 'monto_manual_deduccion',
    con_afecta_salario_bruto: false,
    con_rebaja_salario: true,
  }),
  concepto({ con_codigo: 'COMISION', con_nombre: 'Comisión', con_activo: false }),
]

describe('armarContenidoComprobante', () => {
  it('lista los ingresos activos aunque estén en 0, y las deducciones con monto', () => {
    const c = armarContenidoComprobante(
      {
        montosPorConcepto: { BASE: 200000, CCSS_OBRERA: 21660 },
        salarioBruto: 200000,
        totalDeducciones: 21660,
      },
      CATALOGO
    )

    expect(c.ingresos).toEqual([
      { label: 'Salario base', value: 200000 },
      { label: 'Feriado', value: 0 },
    ])
    expect(c.deducciones).toEqual([{ label: 'CCSS obrera', value: 21660 }])
    expect(c.noSalarial).toEqual([])
    expect(c.subtotal).toBe(178340)
  })

  it('lo no salarial va aparte, solo con monto', () => {
    const c = armarContenidoComprobante(
      {
        montosPorConcepto: { BASE: 200000, VIATICOS: 15000 },
        salarioBruto: 200000,
        totalDeducciones: 0,
      },
      CATALOGO
    )

    expect(c.noSalarial).toEqual([{ label: 'Viáticos', value: 15000 }])
    expect(c.ingresos.map((l) => l.label)).not.toContain('Viáticos')
  })

  it('la ausencia sin goce resta en el bloque del salario, no en deducciones', () => {
    const c = armarContenidoComprobante(
      {
        montosPorConcepto: { BASE: 200000, DED006: 13333.33 },
        salarioBruto: 186666.67,
        totalDeducciones: 0,
      },
      CATALOGO
    )

    expect(c.ingresos).toContainEqual({ label: 'Ausencia sin goce', value: -13333.33 })
    expect(c.deducciones).toEqual([])
  })

  it('un ingreso de un concepto ya desactivado que quedó pagado se sigue mostrando', () => {
    const c = armarContenidoComprobante(
      {
        montosPorConcepto: { BASE: 200000, COMISION: 5000 },
        salarioBruto: 205000,
        totalDeducciones: 0,
      },
      CATALOGO
    )

    expect(c.ingresos).toContainEqual({ label: 'Comisión', value: 5000 })
  })
})
