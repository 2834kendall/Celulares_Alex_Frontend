import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('<Modal />', () => {
  it('muestra el titulo, subtitulo y el contenido', () => {
    render(
      <Modal title="Detalle" subtitle="Informacion adicional" onClose={vi.fn()}>
        <p>Contenido del modal</p>
      </Modal>
    )

    expect(screen.getByRole('dialog', { name: 'Detalle' })).toBeInTheDocument()
    expect(screen.getByText('Informacion adicional')).toBeInTheDocument()
    expect(screen.getByText('Contenido del modal')).toBeInTheDocument()
  })

  it('llama onClose al hacer click en el boton de cerrar', async () => {
    const onClose = vi.fn()
    render(
      <Modal title="Detalle" onClose={onClose}>
        <p>Contenido</p>
      </Modal>
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('llama onClose al hacer click en el fondo, pero no al hacer click en el contenido', async () => {
    const onClose = vi.fn()
    render(
      <Modal title="Detalle" onClose={onClose}>
        <p>Contenido</p>
      </Modal>
    )

    await userEvent.click(screen.getByText('Contenido'))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
