import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesgloseLiquidacionView } from './DesgloseLiquidacionView'
import type { DesgloseLiquidacion } from '@/modules/payroll/types'

const BASE: DesgloseLiquidacion = {
  salarioDiario: 10000,
  salarioDiarioVacaciones: 10000,
  diasSalarioPendiente: 15,
  salarioProporcional: 150000,
  aguinaldoProporcional: 100000,
  diasVacaciones: 5,
  vacacionesPagadas: 50000,
  horasExtraBanco: 0,
  diasPreaviso: 0,
  preaviso: 0,
  diasCesantia: 0,
  cesantia: 0,
  notaPreaviso: null,
  notaCesantia: null,
  diasIndemnizacionPlazoFijo: 0,
  indemnizacionPlazoFijo: 0,
  total: 300000,
  deduccionesObreras: 21660,
  neto: 278340,
  advertencias: [],
}

describe('DesgloseLiquidacionView', () => {
  // Auditoría 2, hallazgo 10: "Preaviso (0 días)" sin explicar parecía un error.
  it('dice por qué el preaviso o la cesantía quedaron en 0 días', () => {
    render(
      <DesgloseLiquidacionView
        datos={{
          ...BASE,
          notaPreaviso: 'menos de 3 meses de antigüedad (Arts. 28 y 29)',
          notaCesantia: 'no aplica por el motivo de salida (Renuncia Voluntaria)',
        }}
      />
    )

    expect(
      screen.getByText('(0 días: menos de 3 meses de antigüedad (Arts. 28 y 29))')
    ).toBeInTheDocument()
    expect(
      screen.getByText('(0 días: no aplica por el motivo de salida (Renuncia Voluntaria))')
    ).toBeInTheDocument()
  })

  it('muestra la indemnización del Art. 31 solo cuando la hay', () => {
    const { rerender } = render(<DesgloseLiquidacionView datos={BASE} />)
    expect(screen.queryByText(/plazo fijo/)).not.toBeInTheDocument()

    rerender(
      <DesgloseLiquidacionView
        datos={{ ...BASE, diasIndemnizacionPlazoFijo: 22, indemnizacionPlazoFijo: 220000 }}
      />
    )
    expect(
      screen.getByText('Indemnización por contrato a plazo fijo (Art. 31)')
    ).toBeInTheDocument()
    expect(screen.getByText('(22 días)')).toBeInTheDocument()
  })
})
