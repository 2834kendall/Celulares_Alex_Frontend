import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'
import { SelectMenu } from './SelectMenu'

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

describe('Modal — teclado, foco y datos sin guardar', () => {
  it('Escape cierra el modal', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal title="Editar" onClose={onClose}>
        <input aria-label="Nombre" />
      </Modal>
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('con algo escrito, tocar el fondo NO cierra (se perdería lo cargado)', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal title="Nuevo candidato" onClose={onClose}>
        <input aria-label="Nombre" />
      </Modal>
    )

    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('Tab no se escapa del panel', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Detrás del modal</button>
        <Modal title="Editar" onClose={vi.fn()}>
          <input aria-label="Nombre" />
        </Modal>
      </>
    )

    // Cerrar (X) → Nombre → vuelve a Cerrar, nunca al botón de atrás.
    await user.tab()
    expect(screen.getByRole('button', { name: /cerrar/i })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Nombre')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /cerrar/i })).toHaveFocus()
  })

  it('al cerrarse devuelve el foco al botón que lo abrió', () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Abrir</button>
          {open && (
            <Modal title="Editar" onClose={vi.fn()}>
              <p>Contenido</p>
            </Modal>
          )}
        </>
      )
    }
    const { rerender } = render(<Harness open={false} />)
    screen.getByRole('button', { name: 'Abrir' }).focus()

    rerender(<Harness open />)
    expect(screen.getByRole('button', { name: 'Abrir' })).not.toHaveFocus()

    rerender(<Harness open={false} />)
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })
})

describe('Modal — Escape con un desplegable abierto adentro', () => {
  it('cierra solo la lista, no el modal', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal title="Editar" onClose={onClose}>
        <SelectMenu
          ariaLabel="Tipo"
          value=""
          onChange={vi.fn()}
          options={[
            { value: 'a', label: 'Opción A' },
            { value: 'b', label: 'Opción B' },
          ]}
        />
      </Modal>
    )

    await user.click(screen.getByLabelText('Tipo'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    // Un segundo Escape, ya sin lista abierta, sí cierra el modal.
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
