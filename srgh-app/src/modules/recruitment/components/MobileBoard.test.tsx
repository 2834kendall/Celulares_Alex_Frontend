import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MobileBoard } from './MobileBoard'
import { resetBoardTab } from '@/modules/recruitment/hooks/useBoardTab'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'

const STAGES: EtapaSeleccionItem[] = [
  { id: 10, nombre: 'Recibido', orden: 0, color: '#1e3a8a' },
  { id: 20, nombre: 'Entrevista', orden: 1, color: null },
  { id: 30, nombre: 'Prueba práctica', orden: 2, color: null },
]

function application(id: number, nombre: string, etapaId: number | null): PostulacionBoardItem {
  return {
    posId: id,
    candidatoId: id + 100,
    candidatoNombre: nombre,
    puestoNombre: 'Vendedor',
    sucursalNombre: 'Centro',
    fechaPostula: '2026-10-01',
    puntajePromedio: null,
    etapaId,
    etapaNombre: etapaId === 99 ? 'Assessment Center' : null,
    etapaColor: null,
  }
}

const ANA = application(1, 'Ana Mora', 10)
const BETO = application(2, 'Beto Ruiz', 10)
const CARLA = application(3, 'Carla Soto', 30)

const onMove = vi.fn()
const onOpenMenu = vi.fn()
const onEditStage = vi.fn()

function renderBoard(props: Partial<React.ComponentProps<typeof MobileBoard>> = {}) {
  return render(
    <MobileBoard
      stages={STAGES}
      byStage={
        new Map([
          [10, [ANA, BETO]],
          [30, [CARLA]],
        ])
      }
      unplaced={[]}
      canWrite
      canManageStages
      onMove={onMove}
      onOpenMenu={onOpenMenu}
      onEditStage={onEditStage}
      {...props}
    />
  )
}

function tab(name: RegExp) {
  return within(screen.getByRole('navigation', { name: 'Etapas del proceso' })).getByRole(
    'button',
    { name }
  )
}

describe('<MobileBoard />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetBoardTab()
  })

  it('una pestaña por etapa, con su conteo, y se ve UNA etapa a la vez', () => {
    renderBoard()

    expect(
      within(screen.getByRole('navigation', { name: 'Etapas del proceso' }))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Recibido: 2 candidatos',
      'Entrevista: 0 candidatos',
      'Prueba práctica: 1 candidato',
    ])

    // Arranca en la primera etapa que tiene a alguien.
    expect(tab(/^Recibido/)).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Ana Mora')).toBeInTheDocument()
    expect(screen.queryByText('Carla Soto')).not.toBeInTheDocument()
  })

  it('tocar otra pestaña cambia de etapa', async () => {
    const user = userEvent.setup()
    renderBoard()

    await user.click(tab(/^Prueba práctica/))

    expect(tab(/^Prueba práctica/)).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Carla Soto')).toBeInTheDocument()
    expect(screen.queryByText('Ana Mora')).not.toBeInTheDocument()
  })

  it('recuerda la etapa al volver al tablero (ida y vuelta a una ficha)', async () => {
    const user = userEvent.setup()
    const { unmount } = renderBoard()
    await user.click(tab(/^Prueba práctica/))
    unmount()

    renderBoard()

    expect(tab(/^Prueba práctica/)).toHaveAttribute('aria-current', 'true')
  })

  it('cada tarjeta trae el paso siguiente a un toque, sin arrastrar', async () => {
    const user = userEvent.setup()
    renderBoard()

    const botones = screen.getAllByRole('button', { name: /Pasar a: Entrevista/ })
    expect(botones).toHaveLength(2)
    await user.click(botones[0])

    expect(onMove).toHaveBeenCalledWith(ANA, STAGES[1])
  })

  it('en la última etapa el paso natural es contratar', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(tab(/^Prueba práctica/))

    expect(screen.queryByRole('button', { name: /Pasar a:/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Contratar/ })).toHaveAttribute(
      'href',
      '/recruitment/candidates/103/hire?postulacionId=3'
    )
  })

  it('el menú de la tarjeta abre el resto de las acciones', async () => {
    const user = userEvent.setup()
    renderBoard()

    await user.click(screen.getByRole('button', { name: 'Acciones de Beto Ruiz' }))

    expect(onOpenMenu).toHaveBeenCalledWith(BETO)
  })

  it('una etapa vacía lo dice en vez de quedar en blanco', async () => {
    const user = userEvent.setup()
    renderBoard()

    await user.click(tab(/^Entrevista/))

    expect(screen.getByText('Sin candidatos en esta etapa')).toBeInTheDocument()
  })

  it('"Sin etapa" va primero y manda a la primera columna', async () => {
    const user = userEvent.setup()
    const eva = application(5, 'Eva Lara', 99)
    renderBoard({ unplaced: [eva] })

    expect(tab(/^Sin etapa: 1 candidato/)).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Estaba en: Assessment Center')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Pasar a: Recibido/ }))
    expect(onMove).toHaveBeenCalledWith(eva, STAGES[0])
    // No es una columna: no se edita.
    expect(screen.queryByRole('button', { name: /^Editar la columna/ })).not.toBeInTheDocument()
  })

  it('deslizar la lista hacia los lados cambia de etapa; scrollear no', () => {
    renderBoard()
    const lista = screen.getByRole('region', { name: /^Recibido/ })

    // Vertical (scroll): no cambia.
    fireEvent.touchStart(lista, { touches: [{ clientX: 200, clientY: 300 }] })
    fireEvent.touchEnd(lista, { changedTouches: [{ clientX: 190, clientY: 100 }] })
    expect(tab(/^Recibido/)).toHaveAttribute('aria-current', 'true')

    // Hacia la izquierda: la etapa siguiente.
    fireEvent.touchStart(lista, { touches: [{ clientX: 300, clientY: 300 }] })
    fireEvent.touchEnd(lista, { changedTouches: [{ clientX: 120, clientY: 310 }] })
    expect(tab(/^Entrevista/)).toHaveAttribute('aria-current', 'true')
  })

  it('quien administra columnas puede editar la etapa que está mirando', async () => {
    const user = userEvent.setup()
    renderBoard()

    await user.click(screen.getByRole('button', { name: 'Editar la columna Recibido' }))

    expect(onEditStage).toHaveBeenCalledWith(STAGES[0])
  })

  it('solo lectura: las tarjetas abren la ficha pero no traen acciones', () => {
    renderBoard({ canWrite: false, canManageStages: false })

    expect(screen.queryByRole('button', { name: /Pasar a:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Acciones de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Editar la columna/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/recruitment/candidates/101')
  })
})
