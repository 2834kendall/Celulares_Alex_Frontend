import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeriodosList } from './PeriodosList'
import type { PeriodoListItem } from '@/modules/payroll/types'
import { deletePeriodo } from '@/modules/payroll/actions/deletePeriodo'
import { toast } from 'sonner'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/modules/payroll/actions/deletePeriodo', () => ({ deletePeriodo: vi.fn() }))
vi.mock('@/modules/payroll/actions/recalcularEstadoPeriodos', () => ({
  recalcularEstadoPeriodos: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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
    puedeEliminar: true,
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

  it('al tocar eliminar pregunta si desea eliminar el periodo antes de borrarlo', async () => {
    render(<PeriodosList periodos={[periodo(1)]} canWrite />)

    await userEvent.click(screen.getByRole('button', { name: /Eliminar Enero/ }))

    expect(
      screen.getByRole('alertdialog', { name: '¿Querés eliminar este periodo?' })
    ).toBeInTheDocument()
    expect(deletePeriodo).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sí, eliminar' })).toBeInTheDocument()
  })
})

describe('PeriodosList: periodo de toda la empresa', () => {
  it('no ofrece eliminar un periodo que la cuenta no puede borrar', () => {
    render(<PeriodosList periodos={[periodo(1, { puedeEliminar: false }), periodo(2)]} canWrite />)

    expect(screen.queryByRole('button', { name: /Eliminar Enero/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Eliminar Febrero/ })).toBeInTheDocument()
  })

  it('"Recalcular estado de los periodos" solo con el permiso de mantenimiento', async () => {
    const { recalcularEstadoPeriodos } =
      await import('@/modules/payroll/actions/recalcularEstadoPeriodos')
    vi.mocked(recalcularEstadoPeriodos).mockResolvedValue({
      ok: true,
      revisados: 4,
      cambiaron: 1,
      cambiaronFechaPago: 0,
    })
    const { unmount } = render(<PeriodosList periodos={PERIODOS} canWrite />)
    expect(
      screen.queryByRole('button', { name: 'Recalcular estado de los periodos' })
    ).not.toBeInTheDocument()
    unmount()

    render(<PeriodosList periodos={PERIODOS} canWrite puedeRecalcularEstados />)
    await userEvent.click(screen.getByRole('button', { name: 'Recalcular estado de los periodos' }))

    expect(recalcularEstadoPeriodos).toHaveBeenCalledTimes(1)
  })

  describe('el aviso de "Recalcular estado de los periodos"', () => {
    async function recalcular(resultado: { cambiaron: number; cambiaronFechaPago: number }) {
      const { recalcularEstadoPeriodos } =
        await import('@/modules/payroll/actions/recalcularEstadoPeriodos')
      vi.mocked(recalcularEstadoPeriodos).mockResolvedValue({
        ok: true,
        revisados: 6,
        ...resultado,
      })
      render(<PeriodosList periodos={PERIODOS} canWrite puedeRecalcularEstados />)
      await userEvent.click(
        screen.getByRole('button', { name: 'Recalcular estado de los periodos' })
      )
    }

    it('sin cambios dice que todo estaba bien', async () => {
      await recalcular({ cambiaron: 0, cambiaronFechaPago: 0 })

      expect(toast.success).toHaveBeenCalledWith(
        'Se revisaron 6 periodo(s): todos tenían el estado y la fecha de pago correctos.'
      )
    })

    it('un cambio solo de fecha de pago se informa (antes pasaba en silencio)', async () => {
      await recalcular({ cambiaron: 0, cambiaronFechaPago: 2 })

      expect(toast.success).toHaveBeenCalledWith(
        'Se revisaron 6 periodo(s) y 2 cambiaron de fecha de pago.'
      )
    })

    it('estado y fecha juntos', async () => {
      await recalcular({ cambiaron: 1, cambiaronFechaPago: 2 })

      expect(toast.success).toHaveBeenCalledWith(
        'Se revisaron 6 periodo(s) y 1 cambió de estado y 2 cambiaron de fecha de pago.'
      )
    })
  })
})
