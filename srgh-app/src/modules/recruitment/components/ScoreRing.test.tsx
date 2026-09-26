import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScoreRing } from './ScoreRing'

describe('<ScoreRing />', () => {
  it('muestra el promedio, la clasificación y el avance', () => {
    render(<ScoreRing score={9} scored={6} notApplicable={1} total={7} />)

    expect(
      screen.getByRole('img', { name: 'Promedio 9 de 10, Sobresaliente (A)' })
    ).toBeInTheDocument()
    expect(screen.getByText('Sobresaliente (A)')).toBeInTheDocument()
    expect(screen.getByText('6 de 7 calificados · 1 N/A')).toBeInTheDocument()
  })

  it('avisa cuántos criterios faltan', () => {
    render(<ScoreRing score={6} scored={2} notApplicable={0} total={7} />)
    expect(screen.getByText('2 de 7 calificados · faltan 5')).toBeInTheDocument()
  })

  it('sin ningún puntaje muestra "Sin calificar" y el anillo vacío', () => {
    const { container } = render(<ScoreRing score={null} scored={0} notApplicable={0} total={7} />)

    expect(screen.getByRole('img', { name: 'Todavía sin puntaje' })).toBeInTheDocument()
    expect(screen.getByText('Sin calificar')).toBeInTheDocument()
    // Solo el círculo de fondo: no se dibuja arco de progreso.
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('el arco se llena en proporción al promedio', () => {
    const { container } = render(<ScoreRing score={5} scored={1} notApplicable={0} total={1} />)
    const arco = container.querySelectorAll('circle')[1]
    const total = Number(arco.getAttribute('stroke-dasharray'))
    const offset = Number(arco.getAttribute('stroke-dashoffset'))
    expect(offset / total).toBeCloseTo(0.5)
  })
})
