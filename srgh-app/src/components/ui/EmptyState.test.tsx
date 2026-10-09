import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Users } from 'lucide-react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('por defecto es la variante "empty", sin role', () => {
    const { container } = render(<EmptyState title="Todavía no hay empleados" />)

    const root = container.firstElementChild
    expect(root).toHaveAttribute('data-variant', 'empty')
    expect(root).not.toHaveAttribute('role')
  })

  it('"no-results" se anuncia como status', () => {
    render(<EmptyState variant="no-results" title="Sin resultados" />)

    expect(screen.getByRole('status')).toHaveTextContent('Sin resultados')
  })

  it('muestra título y descripción', () => {
    render(<EmptyState title="Sin resultados" description="Prueba con otro nombre." />)

    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
    expect(screen.getByText('Prueba con otro nombre.')).toBeInTheDocument()
  })

  it('sin ícono usa el de su variante', () => {
    const { container, rerender } = render(<EmptyState title="Vacío" />)
    expect(container.querySelector('svg')).toHaveClass('lucide-inbox')

    rerender(<EmptyState variant="no-results" title="Sin resultados" />)
    expect(container.querySelector('svg')).toHaveClass('lucide-search-x')
  })

  it('respeta el ícono que pasa la pantalla', () => {
    const { container } = render(<EmptyState icon={Users} title="Sin colaboradores" />)

    expect(container.querySelector('svg')).toHaveClass('lucide-users')
  })

  it('por defecto lleva la caja punteada; framed={false} la quita', () => {
    const { container, rerender } = render(<EmptyState title="Vacío" />)
    expect(container.firstElementChild).toHaveClass('border-dashed')

    rerender(<EmptyState title="Vacío" framed={false} />)
    expect(container.firstElementChild).not.toHaveClass('border-dashed')
  })

  it('renderiza la acción', () => {
    render(<EmptyState title="Vacío" action={<button type="button">Crear el primero</button>} />)

    expect(screen.getByRole('button', { name: 'Crear el primero' })).toBeInTheDocument()
  })
})
