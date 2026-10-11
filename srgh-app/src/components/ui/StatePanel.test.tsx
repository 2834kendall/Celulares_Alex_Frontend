import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Construction } from 'lucide-react'
import { StatePanel } from './StatePanel'
import { ModulePlaceholder } from './ModulePlaceholder'

describe('<StatePanel />', () => {
  it('ocupa la página: título como h1, descripción y su escena', () => {
    const { container } = render(
      <StatePanel kind="not-found" title="No encontramos esta página" description="No existe." />
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'No encontramos esta página' })
    ).toBeVisible()
    expect(screen.getByText('No existe.')).toBeInTheDocument()
    expect(container.querySelector('.state-scene')).toHaveAttribute('data-mood', 'lost')
  })

  it('renderiza las acciones, y sin ellas no deja una fila vacía', () => {
    const { container, rerender } = render(
      <StatePanel
        kind="error"
        title="Error"
        description="Falló."
        actions={<button type="button">Reintentar</button>}
      />
    )
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()

    rerender(<StatePanel kind="error" title="Error" description="Falló." />)
    expect(container.querySelector('.mt-6')).toBeNull()
  })

  it('en "empty" estampa el ícono en la caja de la escena', () => {
    const { container } = render(
      <StatePanel kind="empty" title="Vacío" description="Nada." icon={<Construction />} />
    )

    expect(container.querySelector('.state-scene .lucide-construction')).not.toBeNull()
  })
})

describe('<ModulePlaceholder />', () => {
  it('es un estado "todavía no hay nada", con su texto por defecto', () => {
    const { container } = render(<ModulePlaceholder title="Nómina" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Nómina' })).toBeVisible()
    expect(screen.getByText(/en construcción/i)).toBeInTheDocument()
    expect(container.querySelector('.state-scene')).toHaveAttribute('data-mood', 'sleeping')
  })

  it('respeta la descripción de la pantalla', () => {
    render(<ModulePlaceholder title="Nómina" description="Disponible próximamente." />)

    expect(screen.getByText('Disponible próximamente.')).toBeInTheDocument()
  })
})
