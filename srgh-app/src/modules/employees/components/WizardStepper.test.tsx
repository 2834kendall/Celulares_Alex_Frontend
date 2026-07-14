import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WizardStepper } from './WizardStepper'

const STEPS = [
  { id: 'personal', label: 'Información principal' },
  { id: 'nomina', label: 'Datos de nómina' },
  { id: 'usuario', label: 'Usuario' },
]

describe('<WizardStepper />', () => {
  it('muestra todos los pasos con su número', () => {
    render(<WizardStepper steps={STEPS} currentIndex={0} />)

    expect(screen.getByText('Información principal')).toBeInTheDocument()
    expect(screen.getByText('Datos de nómina')).toBeInTheDocument()
    expect(screen.getByText('Usuario')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('marca el paso actual con aria-current', () => {
    render(<WizardStepper steps={STEPS} currentIndex={1} />)

    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
    expect(items[2]).not.toHaveAttribute('aria-current')
  })

  it('reemplaza el número por un check en los pasos completados', () => {
    render(<WizardStepper steps={STEPS} currentIndex={2} />)

    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
