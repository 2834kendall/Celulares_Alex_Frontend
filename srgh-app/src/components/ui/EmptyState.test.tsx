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

  it('renderiza la acción', () => {
    render(<EmptyState title="Vacío" action={<button type="button">Crear el primero</button>} />)

    expect(screen.getByRole('button', { name: 'Crear el primero' })).toBeInTheDocument()
  })

  describe('md (por defecto): escena ilustrada', () => {
    it('vacío: la figura dormida con el ícono de la pantalla en la caja', () => {
      const { container } = render(<EmptyState icon={Users} title="Sin colaboradores" />)

      const scene = container.querySelector('.state-scene')
      expect(scene).toHaveAttribute('data-mood', 'sleeping')
      expect(scene?.querySelector('.lucide-users')).not.toBeNull()
    })

    it('vacío sin ícono propio estampa el de por defecto', () => {
      const { container } = render(<EmptyState title="Vacío" />)

      expect(container.querySelector('.state-scene .lucide-inbox')).not.toBeNull()
    })

    it('sin resultados: la figura desconcertada con su lupa, sin el ícono', () => {
      const { container } = render(
        <EmptyState variant="no-results" icon={Users} title="Sin resultados" />
      )

      expect(container.querySelector('.state-scene')).toHaveAttribute('data-mood', 'confused')
      expect(container.querySelector('.lucide-users')).toBeNull()
    })

    it('la escena es decorativa', () => {
      const { container } = render(<EmptyState title="Vacío" />)

      expect(container.querySelector('.state-scene')).toHaveAttribute('aria-hidden', 'true')
    })

    it('lleva la caja punteada; framed={false} la quita', () => {
      const { container, rerender } = render(<EmptyState title="Vacío" />)
      expect(container.firstElementChild).toHaveClass('border-dashed')

      rerender(<EmptyState title="Vacío" framed={false} />)
      expect(container.firstElementChild).not.toHaveClass('border-dashed')
    })
  })

  describe('sm: fila compacta', () => {
    it('no dibuja escena: solo el badge con el ícono', () => {
      const { container } = render(<EmptyState size="sm" title="Vacío" />)

      expect(container.querySelector('.state-scene')).toBeNull()
      expect(container.querySelector('.empty-state-badge svg')).toHaveClass('lucide-inbox')
    })

    it('sin ícono usa el de su variante; con ícono, el de la pantalla', () => {
      const { container, rerender } = render(
        <EmptyState size="sm" variant="no-results" title="Sin resultados" />
      )
      expect(container.querySelector('svg')).toHaveClass('lucide-search-x')

      rerender(<EmptyState size="sm" icon={Users} title="Sin colaboradores" />)
      expect(container.querySelector('svg')).toHaveClass('lucide-users')
    })

    it('"no-results" también se anuncia como status', () => {
      render(<EmptyState size="sm" variant="no-results" title="Sin resultados" />)

      expect(screen.getByRole('status')).toHaveTextContent('Sin resultados')
    })

    it('muestra descripción y acción', () => {
      render(
        <EmptyState
          size="sm"
          title="Vacío"
          description="Todavía no hay registros."
          action={<button type="button">Crear</button>}
        />
      )

      expect(screen.getByText('Todavía no hay registros.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument()
    })

    it('lleva fondo gris; framed={false} lo quita', () => {
      const { container, rerender } = render(<EmptyState size="sm" title="Vacío" />)
      expect(container.firstElementChild).toHaveClass('bg-slate-50')

      rerender(<EmptyState size="sm" title="Vacío" framed={false} />)
      expect(container.firstElementChild).not.toHaveClass('bg-slate-50')
    })
  })
})
