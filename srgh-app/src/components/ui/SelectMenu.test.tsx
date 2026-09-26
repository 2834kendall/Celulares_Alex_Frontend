import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectMenu } from './SelectMenu'

const DISTRITOS = [
  { value: '1', label: 'Escazú' },
  { value: '2', label: 'San Rafael' },
  { value: '3', label: 'San Antonio' },
  { value: '4', label: 'Mercedes' },
]

/**
 * Replica como lo montan los formularios del proyecto: un <label> SIN
 * `htmlFor` que envuelve al control (ver Labeled en EmployeeFields). Es lo
 * que hace que `getByLabelText` resuelva al trigger.
 */
function renderSelect(props: Partial<React.ComponentProps<typeof SelectMenu>> = {}) {
  const onChange = props.onChange ?? vi.fn()
  render(
    <label>
      <span>Distrito *</span>
      <SelectMenu options={DISTRITOS} value="" onChange={onChange} {...props} />
    </label>
  )
  return { onChange }
}

describe('<SelectMenu /> — typeahead (sin searchable)', () => {
  it('no renderiza el buscador', async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(screen.getByLabelText('Distrito *'))

    expect(screen.queryByPlaceholderText('Buscar…')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('escribir salta a la primera opción que empieza así', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect()

    screen.getByLabelText('Distrito *').focus()
    await user.keyboard('me')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('4')
  })
})

describe('<SelectMenu /> — searchable', () => {
  it('el trigger conserva su nombre accesible con el panel abierto', async () => {
    const user = userEvent.setup()
    renderSelect({ searchable: true })

    const trigger = screen.getByLabelText('Distrito *')
    await user.click(trigger)

    expect(screen.getByLabelText('Distrito *')).toBe(trigger)
    expect(trigger.tagName).toBe('BUTTON')
  })

  it('filtra las opciones al escribir, ignorando tildes y mayúsculas', async () => {
    const user = userEvent.setup()
    renderSelect({ searchable: true })

    await user.click(screen.getByLabelText('Distrito *'))
    await user.type(screen.getByPlaceholderText('Buscar…'), 'ESCAZU')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'Escazú' })).toBeInTheDocument()
  })

  it('avisa cuando el filtro no arroja nada', async () => {
    const user = userEvent.setup()
    renderSelect({ searchable: true })

    await user.click(screen.getByLabelText('Distrito *'))
    await user.type(screen.getByPlaceholderText('Buscar…'), 'zzz')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(/Sin resultados para/)).toBeInTheDocument()
  })

  // El typeahead saltaría dentro de la lista COMPLETA; con buscador hay que
  // moverse dentro de lo filtrado, o Enter elegiría cualquier otra cosa.
  it('Enter elige el resaltado del set filtrado, no del original', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect({ searchable: true })

    await user.click(screen.getByLabelText('Distrito *'))
    await user.type(screen.getByPlaceholderText('Buscar…'), 'antonio')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('3')
  })

  it('las flechas recorren solo lo filtrado', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect({ searchable: true })

    await user.click(screen.getByLabelText('Distrito *'))
    await user.type(screen.getByPlaceholderText('Buscar…'), 'san')
    // Quedan 'San Rafael' y 'San Antonio'. Una flecha abajo cae en el segundo.
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('3')
  })

  it('la barra de búsqueda acepta espacios en vez de elegir la opción', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect({ searchable: true })

    await user.click(screen.getByLabelText('Distrito *'))
    await user.type(screen.getByPlaceholderText('Buscar…'), 'san r')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'San Rafael' })).toBeInTheDocument()
  })

  it('Escape cierra, devuelve el foco al trigger y descarta la búsqueda', async () => {
    const user = userEvent.setup()
    renderSelect({ searchable: true })

    const trigger = screen.getByLabelText('Distrito *')
    await user.click(trigger)
    await user.type(screen.getByPlaceholderText('Buscar…'), 'escazu')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    // Al reabrir, la lista vuelve completa: la consulta no sobrevive al cierre.
    await user.click(trigger)
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('elegir una opción filtrada limpia la búsqueda para la próxima apertura', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect({ searchable: true })

    await user.click(screen.getByLabelText('Distrito *'))
    await user.type(screen.getByPlaceholderText('Buscar…'), 'mercedes')
    await user.click(screen.getByRole('button', { name: 'Mercedes' }))

    expect(onChange).toHaveBeenCalledWith('4')

    await user.click(screen.getByLabelText('Distrito *'))
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })
})
