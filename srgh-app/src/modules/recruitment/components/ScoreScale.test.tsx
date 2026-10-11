import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScoreScale } from './ScoreScale'

describe('<ScoreScale />', () => {
  it('ofrece 0 a 10 y N/A en un radiogroup con el nombre del criterio', () => {
    render(
      <ScoreScale
        label="Experiencia"
        value={{ puntaje: null, noAplica: false }}
        onChange={vi.fn()}
      />
    )
    const grupo = screen.getByRole('radiogroup', { name: 'Puntaje de Experiencia' })
    expect(grupo).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(12)
  })

  it('un toque elige el puntaje', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ScoreScale
        label="Experiencia"
        value={{ puntaje: null, noAplica: false }}
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('radio', { name: '8' }))

    expect(onChange).toHaveBeenCalledWith({ puntaje: 8, noAplica: false })
  })

  it('N/A marca "no aplica" y limpia el puntaje', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ScoreScale label="Experiencia" value={{ puntaje: 5, noAplica: false }} onChange={onChange} />
    )

    await user.click(screen.getByRole('radio', { name: 'No aplica' }))

    expect(onChange).toHaveBeenCalledWith({ puntaje: null, noAplica: true })
  })

  it('marca como elegido el valor actual', () => {
    render(
      <ScoreScale label="Experiencia" value={{ puntaje: 7, noAplica: false }} onChange={vi.fn()} />
    )
    expect(screen.getByRole('radio', { name: '7' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '6' })).toHaveAttribute('aria-checked', 'false')
  })

  it('una sola parada de Tab y las flechas cambian el puntaje', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ScoreScale label="Experiencia" value={{ puntaje: 7, noAplica: false }} onChange={onChange} />
    )

    await user.tab()
    expect(screen.getByRole('radio', { name: '7' })).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith({ puntaje: 8, noAplica: false })
  })

  it('deshabilitado (sin permiso de escritura) no cambia nada', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ScoreScale
        label="Experiencia"
        value={{ puntaje: 7, noAplica: false }}
        onChange={onChange}
        disabled
      />
    )

    await user.click(screen.getByRole('radio', { name: '3' }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
