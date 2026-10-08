import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeriodosList } from './PeriodosList'
import type { PeriodoListItem } from '@/modules/payroll/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/modules/payroll/actions/deletePeriodo', () => ({ deletePeriodo: vi.fn() }))

function periodo(id: number, over: Partial<PeriodoListItem> = {}): PeriodoListItem {
  return {
    id,
    mes: id,
    anio: 2026,
    quincena: 1,
    fechaInicio: '2026-01-01',
    fechaFin: '2026-01-15',
    estado: 'borrador',
    atrasado: false,
    fechaPago: null,
    observaciones: null,
    sucursalNombre: 'Norte',
    totalEmpleados: 3,
    ...over,
  } as PeriodoListItem
}

// Enero y febrero atrasados, marzo en borrador, abril pagado.
const PERIODOS = [
  periodo(1, { atrasado: true }),
  periodo(2, { atrasado: true }),
  periodo(3),
  periodo(4, { estado: 'pagado', fechaPago: '2026-04-15' }),
]

/** Las filas de la tabla (jsdom ve también las tarjetas móviles). */
function filas() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

describe('<PeriodosList /> tarjetas de filtro', () => {
  it('"Atrasados" deja solo los atrasados', async () => {
    render(<PeriodosList periodos={PERIODOS} canWrite />)

    await userEvent.click(screen.getByRole('button', { name: /Atrasados/ }))

    expect(filas().map((f) => (f as HTMLTableRowElement).cells[0].textContent)).toEqual([
      'Enero 2026 · 1ª quincena',
      'Febrero 2026 · 1ª quincena',
    ])
    expect(screen.getByRole('button', { name: /Atrasados/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('"En borrador" deja los borradores que no están atrasados', async () => {
    render(<PeriodosList periodos={PERIODOS} canWrite />)

    await userEvent.click(screen.getByRole('button', { name: /En borrador/ }))

    expect(filas().map((f) => (f as HTMLTableRowElement).cells[0].textContent)).toEqual([
      'Marzo 2026 · 1ª quincena',
    ])
  })

  it('tocar el filtro activo lo quita, y "Periodos" muestra todos', async () => {
    render(<PeriodosList periodos={PERIODOS} canWrite />)
    const atrasados = screen.getByRole('button', { name: /Atrasados/ })

    await userEvent.click(atrasados)
    await userEvent.click(atrasados)
    expect(filas()).toHaveLength(4)

    await userEvent.click(atrasados)
    await userEvent.click(screen.getByRole('button', { name: /Periodos/ }))
    expect(filas()).toHaveLength(4)
    expect(screen.getByRole('button', { name: /Periodos/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('la tarjeta y el selector de estado muestran el mismo filtro', async () => {
    render(<PeriodosList periodos={PERIODOS} canWrite />)

    await userEvent.click(screen.getByRole('button', { name: /Atrasados/ }))

    expect(screen.getByRole('button', { name: 'Filtrar por estado' })).toHaveTextContent('Atrasado')
  })

  it('pagina de a 8 periodos', () => {
    render(
      <PeriodosList periodos={Array.from({ length: 12 }, (_, i) => periodo(i + 1))} canWrite />
    )

    expect(filas()).toHaveLength(8)
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('el botón de eliminar dice qué hace al pasar el mouse', () => {
    render(<PeriodosList periodos={[periodo(1)]} canWrite />)

    expect(screen.getByRole('button', { name: /Eliminar Enero/ })).toHaveAttribute(
      'title',
      'Eliminar periodo'
    )
  })
})
