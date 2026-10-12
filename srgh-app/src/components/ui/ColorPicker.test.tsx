import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColorPicker } from './ColorPicker'

const KEY = 'test_colors'

function setup(onChange = vi.fn()) {
  render(<ColorPicker value={null} onChange={onChange} label="Color" storageKey={KEY} />)
  return onChange
}

function area() {
  const el = document.querySelector<HTMLElement>('.cursor-crosshair')!
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect
  el.setPointerCapture = vi.fn()
  el.hasPointerCapture = vi.fn(() => true)
  return el
}

describe('<ColorPicker />', () => {
  beforeEach(() => window.localStorage.clear())

  it('arrastrar en el selector NO agrega colores: solo el boton "Agregar color" lo hace, una vez', async () => {
    const user = userEvent.setup()
    const onChange = setup()
    await user.click(screen.getByRole('button', { name: 'Agregar color personalizado' }))

    const el = area()
    fireEvent.pointerDown(el, { clientX: 10, clientY: 90, pointerId: 1 })
    for (let x = 20; x <= 180; x += 20)
      fireEvent.pointerMove(el, { clientX: x, clientY: 30, pointerId: 1 })

    expect(onChange).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Agregar color' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(window.localStorage.getItem(KEY)!)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toBe(onChange.mock.calls[0][0])
    expect(saved[0]).toMatch(/^#[0-9a-f]{6}$/)
    // El popover se cierra y queda una sola muestra personalizada.
    expect(screen.queryByRole('button', { name: 'Agregar color' })).toBeNull()
    expect(screen.getAllByRole('button', { name: `Usar ${saved[0]}` })).toHaveLength(1)
  })

  it('el campo hex acepta un codigo valido y lo agrega tal cual', async () => {
    const user = userEvent.setup()
    const onChange = setup()
    await user.click(screen.getByRole('button', { name: 'Agregar color personalizado' }))

    const input = screen.getByLabelText('Codigo hexadecimal')
    await user.clear(input)
    await user.type(input, '#ff8800')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Agregar color' }))

    expect(onChange).toHaveBeenCalledWith('#ff8800')
  })

  it('un hex invalido se descarta y no cambia el color', async () => {
    const user = userEvent.setup()
    const onChange = setup()
    await user.click(screen.getByRole('button', { name: 'Agregar color personalizado' }))

    const before = (screen.getByLabelText('Codigo hexadecimal') as HTMLInputElement).value
    const input = screen.getByLabelText('Codigo hexadecimal')
    await user.clear(input)
    await user.type(input, 'zzz')
    await user.tab()

    expect((screen.getByLabelText('Codigo hexadecimal') as HTMLInputElement).value).toBe(before)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Escape y clic fuera cierran el popover sin agregar nada', async () => {
    const user = userEvent.setup()
    const onChange = setup()
    const open = () =>
      user.click(screen.getByRole('button', { name: 'Agregar color personalizado' }))

    await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Agregar color' })).toBeNull()

    await open()
    await user.click(document.body)
    expect(screen.queryByRole('button', { name: 'Agregar color' })).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('el panel del color a medida sale del contenedor: un modal con scroll no lo recorta', async () => {
    const user = userEvent.setup()
    // Como el cuerpo de un Modal: scrollea, y recortaba el panel.
    const { container } = render(
      <div style={{ overflow: 'auto' }}>
        <ColorPicker value={null} onChange={vi.fn()} label="Color" storageKey={KEY} />
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'Agregar color personalizado' }))

    const panel = screen.getByLabelText('Tono').closest<HTMLElement>('.fixed')
    expect(panel).not.toBeNull()
    expect(container.contains(panel)).toBe(false)

    // Usar el panel no lo cierra, aunque ya no sea hijo del botón...
    await user.click(screen.getByLabelText('Codigo hexadecimal'))
    expect(screen.getByLabelText('Tono')).toBeInTheDocument()

    // ...y tocar fuera sí.
    await user.click(screen.getByRole('button', { name: 'Usar #AEE1F9' }))
    expect(screen.queryByLabelText('Tono')).not.toBeInTheDocument()
  })

  it('el color nuevo queda ÚLTIMO en la fila, junto al "+", y marcado', async () => {
    window.localStorage.setItem(KEY, JSON.stringify(['#111111', '#222222']))
    const user = userEvent.setup()
    // Con estado real: el swatch marcado depende del valor que vuelve por props.
    function Harness() {
      const [value, setValue] = useState<string | null>(null)
      return <ColorPicker value={value} onChange={setValue} label="Color" storageKey={KEY} />
    }
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Agregar color personalizado' }))
    await user.click(screen.getByRole('button', { name: 'Agregar color' }))

    const swatches = screen.getAllByRole('button', { name: /^Usar #/ })
    const last = swatches[swatches.length - 1]
    expect(last).toHaveAttribute('aria-pressed', 'true')
    // Los que ya estaban conservan su lugar, antes del nuevo.
    expect(JSON.parse(window.localStorage.getItem(KEY)!).slice(0, 2)).toEqual([
      '#111111',
      '#222222',
    ])
    expect(swatches.filter((swatch) => swatch.getAttribute('aria-pressed') === 'true')).toEqual([
      last,
    ])
  })

  it('elegir el mismo color dos veces no lo duplica', async () => {
    const user = userEvent.setup()
    setup()
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: 'Agregar color personalizado' }))
      await user.click(screen.getByRole('button', { name: 'Agregar color' }))
    }
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toHaveLength(1)
  })
})
