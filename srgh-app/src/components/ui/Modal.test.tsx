import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renderiza título, subtítulo y children', () => {
    render(
      <Modal title="Editar foto" subtitle="Sube una imagen" onClose={vi.fn()}>
        <p>Contenido</p>
      </Modal>
    )

    expect(screen.getByText('Editar foto')).toBeInTheDocument()
    expect(screen.getByText('Sube una imagen')).toBeInTheDocument()
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('cierra al hacer click en el botón X', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal title="Editar foto" onClose={onClose}>
        <p>Contenido</p>
      </Modal>
    )

    await user.click(screen.getByRole('button', { name: /cerrar/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cierra al hacer click en el backdrop pero no al hacer click dentro del panel', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal title="Editar foto" onClose={onClose}>
        <p>Contenido</p>
      </Modal>
    )

    await user.click(screen.getByText('Contenido'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bloquea el scroll del body mientras está montado y lo restaura al desmontar', () => {
    const { unmount } = render(
      <Modal title="Editar foto" onClose={vi.fn()}>
        <p>Contenido</p>
      </Modal>
    )

    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('')
  })
})
