import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttendanceTabs } from './AttendanceTabs'

const push = vi.fn()
let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/attendance',
  useSearchParams: () => new URLSearchParams(searchString),
}))

function renderTabs() {
  return render(
    <AttendanceTabs
      diarioContent={<div>Contenido diario</div>}
      resumenContent={<div>Contenido resumen</div>}
    />
  )
}

describe('<AttendanceTabs />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchString = ''
  })

  it('sin parametro "tab" muestra diario como pestana activa por defecto', () => {
    renderTabs()

    expect(screen.getByText('Contenido diario')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Diario/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('muestra el resumen mensual cuando ?tab=resumen', () => {
    searchString = 'tab=resumen'
    renderTabs()

    expect(screen.getByText('Contenido resumen')).toBeInTheDocument()
    expect(screen.queryByText('Contenido diario')).not.toBeInTheDocument()
  })

  it('cae de vuelta a diario si el tab de la url es invalido', () => {
    searchString = 'tab=inexistente'
    renderTabs()

    expect(screen.getByText('Contenido diario')).toBeInTheDocument()
  })

  it('al hacer click en resumen mensual navega agregando el query param', async () => {
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Resumen mensual/ }))

    expect(push).toHaveBeenCalledWith('/attendance?tab=resumen')
  })

  it('al volver a diario quita el query param', async () => {
    searchString = 'tab=resumen'
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Diario/ }))

    expect(push).toHaveBeenCalledWith('/attendance')
  })

  it('preserva otros parametros de la url al cambiar de tab', async () => {
    searchString = 'date=2026-07-20'
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Resumen mensual/ }))

    expect(push).toHaveBeenCalledWith('/attendance?date=2026-07-20&tab=resumen')
  })
})
