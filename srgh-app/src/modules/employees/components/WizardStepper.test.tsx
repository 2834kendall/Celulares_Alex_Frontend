import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { WizardStepper } from './WizardStepper'

const STEPS = [
  { id: 'personal', label: 'Información principal' },
  { id: 'nomina', label: 'Datos de nómina' },
  { id: 'usuario', label: 'Usuario' },
]

/**
 * El stepper tiene DOS presentaciones sobre la misma data: en angosto solo el
 * paso actual con una barra de avance, y desde @md la fila completa. En un
 * navegador solo una existe (la otra es display:none), pero jsdom no aplica
 * CSS y ve las dos, asi que el nombre del paso actual aparece duplicado. Se
 * consulta dentro de la rama que interesa.
 */
function filaCompleta() {
  return within(screen.getByRole('list'))
}

describe('<WizardStepper />', () => {
  it('muestra todos los pasos con su número', () => {
    render(<WizardStepper steps={STEPS} currentIndex={0} />)

    expect(filaCompleta().getByText('Información principal')).toBeInTheDocument()
    expect(filaCompleta().getByText('Datos de nómina')).toBeInTheDocument()
    expect(filaCompleta().getByText('Usuario')).toBeInTheDocument()
    expect(filaCompleta().getByText('1')).toBeInTheDocument()
    expect(filaCompleta().getByText('2')).toBeInTheDocument()
    expect(filaCompleta().getByText('3')).toBeInTheDocument()
  })

  it('en angosto muestra el paso actual y el avance, no los cuatro nombres', () => {
    render(<WizardStepper steps={STEPS} currentIndex={1} />)

    const barra = screen.getByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuenow', '2')
    expect(barra).toHaveAttribute('aria-valuemax', '3')
    expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument()
  })

  it('marca el paso actual con aria-current', () => {
    render(<WizardStepper steps={STEPS} currentIndex={1} />)

    const items = filaCompleta().getAllByRole('listitem')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
    expect(items[2]).not.toHaveAttribute('aria-current')
  })

  it('reemplaza el número por un check en los pasos completados', () => {
    render(<WizardStepper steps={STEPS} currentIndex={2} />)

    expect(filaCompleta().queryByText('1')).not.toBeInTheDocument()
    expect(filaCompleta().queryByText('2')).not.toBeInTheDocument()
    expect(filaCompleta().getByText('3')).toBeInTheDocument()
  })
})
