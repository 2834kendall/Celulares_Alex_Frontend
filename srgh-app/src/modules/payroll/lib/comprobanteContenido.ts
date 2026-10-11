/**
 * Líneas del comprobante de pago de planilla: qué rubros se imprimen y en qué
 * bloque va cada uno.
 *
 * Lo usan la página del comprobante (app/comprobante/...) y el PDF que se le
 * manda por correo al empleado (lib/comprobantePdf.ts). Antes vivía dentro de
 * la página: con dos copias, el papel impreso y el PDF del correo podían
 * terminar mostrando rubros distintos para el mismo pago.
 */

import { esRebajoDeSalario } from '@/modules/payroll/lib/planilla'

export interface LineaComprobante {
  label: string
  /** Negativo = resta dentro de su bloque (ausencia sin goce en el salario). */
  value: number
}

export interface ContenidoComprobante {
  ingresos: LineaComprobante[]
  /** Lo que se paga pero no es salario (viáticos): no cotiza ni cuenta para el aguinaldo. */
  noSalarial: LineaComprobante[]
  deducciones: LineaComprobante[]
  /** Bruto − deducciones, antes de sumar lo no salarial. */
  subtotal: number
}

export interface ConceptoComprobante {
  con_codigo: string
  con_nombre: string
  con_activo: boolean
  con_tipo_calculo: string
  con_afecta_salario_bruto: boolean
  con_rebaja_salario?: boolean | null
}

const TIPOS_CALCULO_INGRESO = new Set(['monto_manual_ingreso', 'horas_extra_automatico'])

export function armarContenidoComprobante(
  detalle: {
    montosPorConcepto: Record<string, number>
    salarioBruto: number
    totalDeducciones: number
  },
  conceptos: ConceptoComprobante[]
): ContenidoComprobante {
  const conceptoPorCodigo = new Map(conceptos.map((c) => [c.con_codigo, c]))

  const ingresos: LineaComprobante[] = []
  const noSalarial: LineaComprobante[] = []
  const deducciones: LineaComprobante[] = []
  const codigosMostrados = new Set<string>()

  /** Un ingreso va al bloque de salario o al de "otros pagos" según el catálogo. */
  function agregarIngreso(
    concepto: { con_afecta_salario_bruto: boolean } | undefined,
    label: string,
    value: number
  ) {
    if (concepto?.con_afecta_salario_bruto === false) {
      // Los no salariales solo se listan si tienen monto: un "Viáticos ₡0" en
      // cada comprobante es ruido, a diferencia de los rubros de salario.
      if (value > 0) noSalarial.push({ label, value })
      return
    }
    ingresos.push({ label, value })
  }

  // Todos los conceptos de ingreso ACTIVOS del catálogo se muestran siempre,
  // aunque el empleado no haya ganado nada ahí este periodo — así "0" queda
  // explícito (ej. Feriado) en vez de que el rubro simplemente desaparezca.
  for (const concepto of conceptos) {
    if (!concepto.con_activo || !TIPOS_CALCULO_INGRESO.has(concepto.con_tipo_calculo)) continue
    agregarIngreso(
      concepto,
      concepto.con_nombre,
      detalle.montosPorConcepto[concepto.con_codigo] ?? 0
    )
    codigosMostrados.add(concepto.con_codigo)
  }

  // Cualquier otro monto real guardado: deducciones (solo si tienen monto,
  // no tiene sentido listar cada deducción posible en 0) y conceptos de
  // ingreso ya desactivados del catálogo que igual quedaron pagados en este
  // periodo (ej. un pago de banco de horas con HORAS_EXTRA).
  for (const [codigo, monto] of Object.entries(detalle.montosPorConcepto)) {
    if (codigosMostrados.has(codigo) || monto <= 0) continue
    const concepto = conceptoPorCodigo.get(codigo)
    const label = concepto?.con_nombre ?? codigo
    // La ausencia sin goce rebaja el salario: va restando en el bloque del
    // salario, para que ese bloque sume el bruto (auditoría 2, hallazgo 6).
    if (concepto && esRebajoDeSalario(concepto)) {
      ingresos.push({ label, value: -monto })
      continue
    }
    if (concepto && TIPOS_CALCULO_INGRESO.has(concepto.con_tipo_calculo)) {
      agregarIngreso(concepto, label, monto)
    } else {
      deducciones.push({ label, value: monto })
    }
  }

  return {
    ingresos,
    noSalarial,
    deducciones,
    subtotal: detalle.salarioBruto - detalle.totalDeducciones,
  }
}
