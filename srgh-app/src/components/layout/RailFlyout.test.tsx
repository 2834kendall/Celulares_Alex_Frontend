import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RailFlyout, railFlyoutItemClass } from './RailFlyout'

/**
 * Un riel minimo: el area que marca el borde, el boton que abre el panel y
 * otro control despues, como el siguiente icono.
 */
function Rail({ focusOnOpen = false, onClose = vi.fn() }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <div data-rail-area="">
        <button type="button" onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}>
          Modulo
        </button>
        <button type="button">Siguiente</button>
      </div>
      {anchor && (
        <RailFlyout
          id="panel"
          label="Reclutamiento"
          anchor={anchor}
          focusOnOpen={focusOnOpen}
          onClose={() => {
            onClose()
            setAnchor(null)
          }}
        >
          <a href="/uno">Uno</a>
          <a href="/dos">Dos</a>
        </RailFlyout>
      )}
    </>
  )
}

async function openRail(props: Parameters<typeof Rail>[0] = {}) {
  render(<Rail {...props} />)
  await userEvent.click(screen.getByRole('button', { name: 'Modulo' }))
  return screen.getByRole('group', { name: 'Reclutamiento' })
}

describe('RailFlyout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('se abre fuera del riel (portal), junto a su borde y a la altura del boton', async () => {
    // jsdom mide todo en 0: el riel termina en x = 76 y el boton esta en y = 120.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const rect = this.hasAttribute('data-rail-area')
        ? { right: 76, top: 0 }
        : { right: 58, top: 120 }
      return rect as DOMRect
    })

    const panel = await openRail()

    expect(panel.parentElement).toBe(document.body)
    expect(panel.style.left).toBe('84px')
    expect(panel.style.top).toBe('120px')
  })

  it('no se sale por abajo de la ventana', async () => {
    // Un boton cerca del borde inferior y un panel de 100px de alto.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      right: 58,
      top: window.innerHeight - 40,
    } as DOMRect)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100)

    const panel = await openRail()

    expect(panel.style.top).toBe(`${window.innerHeight - 108}px`)
  })

  it('con el encabezado del grupo, oculto para los lectores (ya es el nombre del panel)', async () => {
    const panel = await openRail()

    expect(panel).toHaveTextContent('Reclutamiento')
    expect(screen.getByText('Reclutamiento', { selector: 'p' })).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('abierto con teclado, el foco entra al primer link', async () => {
    await openRail({ focusOnOpen: true })

    expect(screen.getByRole('link', { name: 'Uno' })).toHaveFocus()
  })

  it('abierto con el puntero, el foco se queda en el boton', async () => {
    await openRail()

    expect(screen.getByRole('button', { name: 'Modulo' })).toHaveFocus()
  })

  it('Escape lo cierra y devuelve el foco al boton', async () => {
    const onClose = vi.fn()
    await openRail({ focusOnOpen: true, onClose })

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Modulo' })).toHaveFocus()
  })

  it('Tab desde el ultimo link lo cierra y vuelve al boton', async () => {
    const onClose = vi.fn()
    await openRail({ focusOnOpen: true, onClose })

    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Dos' })).toHaveFocus()
    await userEvent.tab()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Modulo' })).toHaveFocus()
  })

  it('Shift+Tab desde el primer link lo cierra y vuelve al boton', async () => {
    const onClose = vi.fn()
    await openRail({ focusOnOpen: true, onClose })

    await userEvent.tab({ shift: true })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Modulo' })).toHaveFocus()
  })

  it('otras teclas no lo cierran', async () => {
    const onClose = vi.fn()
    await openRail({ focusOnOpen: true, onClose })

    await userEvent.keyboard('{ArrowDown}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('un clic fuera lo cierra; uno adentro, no', async () => {
    const onClose = vi.fn()
    const panel = await openRail({ onClose })

    fireEvent.pointerDown(panel)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('el clic sobre el boton no cuenta como "fuera": el boton lo alterna', async () => {
    const onClose = vi.fn()
    await openRail({ onClose })

    await userEvent.click(screen.getByRole('button', { name: 'Modulo' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Reclutamiento' })).not.toBeInTheDocument()
  })

  it.each(['scroll', 'resize'] as const)('un %s lo cierra (quedaria desubicado)', async (type) => {
    const onClose = vi.fn()
    await openRail({ onClose })

    fireEvent(window, new Event(type))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('si el foco se va a otro control, se cierra', async () => {
    const onClose = vi.fn()
    await openRail({ focusOnOpen: true, onClose })

    screen.getByRole('button', { name: 'Siguiente' }).focus()

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('si el foco vuelve al boton o sale de la ventana, no se cierra solo', async () => {
    const onClose = vi.fn()
    await openRail({ focusOnOpen: true, onClose })

    screen.getByRole('button', { name: 'Modulo' }).focus()
    screen.getByRole('link', { name: 'Uno' }).focus()
    screen.getByRole('link', { name: 'Uno' }).blur()

    expect(onClose).not.toHaveBeenCalled()
  })

  it('la clase de los links marca la pagina actual', () => {
    expect(railFlyoutItemClass(true)).toContain('bg-brand-50')
    expect(railFlyoutItemClass(false)).not.toContain('bg-brand-50')
  })
})
