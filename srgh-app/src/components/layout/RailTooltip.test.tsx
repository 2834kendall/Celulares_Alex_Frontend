import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RailTooltipArea } from './RailTooltip'

function renderArea(enabled = true) {
  render(
    <RailTooltipArea enabled={enabled}>
      <button type="button" data-tooltip="Empleados">
        icono
      </button>
      <button type="button">sin tooltip</button>
    </RailTooltipArea>
  )
  return screen.getByRole('button', { name: 'icono' })
}

const tooltip = () => document.querySelector('[data-rail-tooltip]')

describe('RailTooltipArea', () => {
  it('muestra el nombre al pasar el puntero', () => {
    const link = renderArea()

    fireEvent.pointerOver(link, { pointerType: 'mouse' })

    expect(tooltip()).toHaveTextContent('Empleados')
    expect(tooltip()).toHaveAttribute('aria-hidden', 'true')
  })

  it('muestra el nombre al llegar con el teclado', () => {
    const link = renderArea()

    fireEvent.focus(link)

    expect(tooltip()).toHaveTextContent('Empleados')
  })

  it('ignora el toque en pantallas táctiles', () => {
    const link = renderArea()

    fireEvent.pointerOver(link, { pointerType: 'touch' })

    expect(tooltip()).toBeNull()
  })

  it('no muestra nada si no está habilitado (menú expandido)', () => {
    const link = renderArea(false)

    fireEvent.pointerOver(link, { pointerType: 'mouse' })

    expect(tooltip()).toBeNull()
  })

  it('sobre un elemento sin data-tooltip no muestra nada', () => {
    renderArea()

    fireEvent.pointerOver(screen.getByRole('button', { name: 'sin tooltip' }), {
      pointerType: 'mouse',
    })

    expect(tooltip()).toBeNull()
  })

  it.each([
    ['al salir el puntero', (el: Element) => fireEvent.pointerLeave(el.parentElement!)],
    ['al hacer clic', (el: Element) => fireEvent.pointerDown(el)],
    ['al perder el foco', (el: Element) => fireEvent.blur(el)],
    ['al hacer scroll', (el: Element) => fireEvent.scroll(el.parentElement!)],
    ['con Escape', (el: Element) => fireEvent.keyDown(el, { key: 'Escape' })],
  ])('se oculta %s', (_caso, ocultar) => {
    const link = renderArea()
    fireEvent.pointerOver(link, { pointerType: 'mouse' })
    expect(tooltip()).not.toBeNull()

    ocultar(link)

    expect(tooltip()).toBeNull()
  })

  it('otras teclas no lo ocultan', () => {
    const link = renderArea()
    fireEvent.pointerOver(link, { pointerType: 'mouse' })

    fireEvent.keyDown(link, { key: 'Tab' })

    expect(tooltip()).not.toBeNull()
  })
})
