import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renderiza el titulo como el h1 de la pagina', () => {
    render(<PageHeader title="Empleados" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Empleados' })).toBeInTheDocument()
  })

  it('sin descripcion no agrega bajada', () => {
    const { container } = render(<PageHeader title="Empleados" />)

    expect(container.querySelector('p')).not.toBeInTheDocument()
  })

  it('con descripcion la muestra debajo del titulo', () => {
    render(<PageHeader title="Banco de horas" description="Horas extra pendientes." />)

    expect(screen.getByText('Horas extra pendientes.')).toBeInTheDocument()
  })

  it('muestra la barra de acento por defecto', () => {
    render(<PageHeader title="Empleados" />)

    expect(screen.getByTestId('page-header-accent')).toBeInTheDocument()
  })

  it('leading reemplaza la barra de acento', () => {
    render(<PageHeader title="Ana Mora" leading={<span>avatar</span>} />)

    expect(screen.getByText('avatar')).toBeInTheDocument()
    expect(screen.queryByTestId('page-header-accent')).not.toBeInTheDocument()
  })

  it('con backHref muestra la flecha de volver con su nombre accesible', () => {
    render(<PageHeader title="Nuevo periodo" backHref="/payroll" backLabel="Volver a nómina" />)

    expect(screen.getByRole('link', { name: 'Volver a nómina' })).toHaveAttribute(
      'href',
      '/payroll'
    )
  })

  it('la flecha sin backLabel se anuncia como "Volver"', () => {
    render(<PageHeader title="Detalle" backHref="/payroll" />)

    expect(screen.getByRole('link', { name: 'Volver' })).toBeInTheDocument()
  })

  it('renderiza las acciones', () => {
    render(<PageHeader title="Empleados" actions={<button type="button">Nuevo empleado</button>} />)

    expect(screen.getByRole('button', { name: 'Nuevo empleado' })).toBeInTheDocument()
  })

  it('titleId queda en el h1 para aria-labelledby', () => {
    render(<PageHeader title="Empleados / Puestos" titleId="settings-positions-title" />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute(
      'id',
      'settings-positions-title'
    )
  })
})
