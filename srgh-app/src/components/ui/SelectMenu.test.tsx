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
 * que hace que `getByLabelText` resuelva al trigger, y lo que el buscador no
 * debe romper — de ahi que viva dentro del panel, despues del <button>.
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

describe('<SelectMenu />', () => {
  it('sin searchable no renderiza el buscador', async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(screen.getByLabelText('Distrito *'))

    expect(screen.queryByPlaceholderText('Buscar…')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('el trigger conserva su nombre accesible con el buscador abierto', async () => {
    const user = userEvent.setup()
    renderSelect({ searchable: true })

    // Regresion: si el <input> de busqueda quedara ANTES del trigger en orden
    // de documento, el <label> envolvente lo tomaria a el como su control y
    // este query devolveria el buscador.
    const trigger = screen.getByLabelText('Distrito *')
    await user.click(trigger)

    expect(screen.getByLabelText('Distrito *')).toBe(trigger)
    expect(trigger.tagName).toBe('BUTTON')
  })

  it('filtra las opciones al escribir, ignorando tildes y mayusculas', async () => {
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

  it('Enter elige el resaltado del set FILTRADO, no del original', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect({ searchable: true })

    await user.click(screen.getByLabelText('Distrito *'))
    // 'San Antonio' es el tercero de la lista completa; filtrando por
    // 'antonio' queda primero, que es donde arranca el resaltado.
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

  it('Escape cierra, devuelve el foco al trigger y descarta la busqueda', async () => {
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

  it('elegir una opcion filtrada limpia la busqueda para la proxima apertura', async () => {
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
