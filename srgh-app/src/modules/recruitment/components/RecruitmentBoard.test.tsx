import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { RecruitmentBoard } from './RecruitmentBoard'
import { moveApplicationToStage } from '@/modules/recruitment/actions/moveApplicationToStage'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/recruitment/actions/moveApplicationToStage', () => ({
  moveApplicationToStage: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/reorderSelectionStages', () => ({
  reorderSelectionStages: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/rejectPostulacion', () => ({ rejectPostulacion: vi.fn() }))
vi.mock('@/modules/recruitment/actions/createEtapaSeleccion', () => ({
  createEtapaSeleccion: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/updateEtapaSeleccion', () => ({
  updateEtapaSeleccion: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/deleteEtapaSeleccion', () => ({
  deleteEtapaSeleccion: vi.fn(),
}))
// El alta de candidato tiene sus propias pruebas: acá solo estorba.
vi.mock('./NuevoCandidatoForm', () => ({ NuevoCandidatoForm: () => null }))

const STAGES: EtapaSeleccionItem[] = [
  { id: 10, nombre: 'Recibido', orden: 0, color: '#1e3a8a' },
  { id: 20, nombre: 'Entrevista', orden: 1, color: null },
  { id: 30, nombre: 'Prueba práctica', orden: 2, color: null },
]

function application(
  id: number,
  nombre: string,
  etapaId: number | null,
  overrides: Partial<PostulacionBoardItem> = {}
): PostulacionBoardItem {
  return {
    posId: id,
    candidatoId: id + 100,
    candidatoNombre: nombre,
    puestoNombre: 'Vendedor',
    sucursalNombre: 'Centro',
    fechaPostula: '2026-10-01',
    puntajePromedio: null,
    etapaId,
    etapaNombre: STAGES.find((stage) => stage.id === etapaId)?.nombre ?? null,
    etapaColor: null,
    ...overrides,
  }
}

const ANA = application(1, 'Ana Mora', 10)
const BETO = application(2, 'Beto Ruiz', 10, { puntajePromedio: 8.5 })
const CARLA = application(3, 'Carla Soto', 20)

function renderBoard(props: Partial<React.ComponentProps<typeof RecruitmentBoard>> = {}) {
  render(
    <RecruitmentBoard
      postulaciones={[ANA, BETO, CARLA]}
      stages={STAGES}
      tiposIdentificacion={[]}
      puestos={[]}
      sucursales={[]}
      canWrite
      canManageStages
      {...props}
    />
  )
}

function column(name: RegExp) {
  return screen.getByRole('region', { name })
}

describe('<RecruitmentBoard />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom no trae matchMedia; el tablero lo consulta por "reducir movimiento".
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    // Tampoco scrollTo en elementos: lo usa el índice para ir a una columna.
    Element.prototype.scrollTo = vi.fn()
    window.localStorage.clear()
  })

  it('pinta una columna por etapa, en el orden del tablero, con su conteo', () => {
    renderBoard()

    expect(screen.getAllByRole('region').map((el) => el.getAttribute('aria-label'))).toEqual([
      'Recibido: 2 candidatos',
      'Entrevista: 1 candidato',
      'Prueba práctica: 0 candidatos',
    ])
    expect(within(column(/^Prueba práctica/)).getByText('Sin candidatos')).toBeInTheDocument()
    expect(screen.getByText(/3 postulaciones en proceso/)).toBeInTheDocument()
  })

  it('dentro de la columna, el mejor puntaje va arriba', () => {
    renderBoard()

    const nombres = within(column(/^Recibido/))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    expect(nombres).toEqual(['/recruitment/candidates/102', '/recruitment/candidates/101'])
  })

  it('"Sin etapa" aparece solo si hay postulaciones fuera de las columnas', () => {
    renderBoard()
    expect(screen.queryByRole('region', { name: /^Sin etapa/ })).not.toBeInTheDocument()
  })

  it('"Sin etapa" junta las que no tienen etapa y las de una etapa que ya no es columna', () => {
    renderBoard({
      postulaciones: [
        ANA,
        application(4, 'Dani Vega', null),
        application(5, 'Eva Lara', 99, { etapaNombre: 'Assessment Center' }),
      ],
    })

    const sinEtapa = column(/^Sin etapa: 2 candidatos/)
    expect(within(sinEtapa).getByText('Dani Vega')).toBeInTheDocument()
    expect(within(sinEtapa).getByText('Estaba en: Assessment Center')).toBeInTheDocument()
    // Va primero: es lo que hay que resolver.
    expect(screen.getAllByRole('region')[0]).toBe(sinEtapa)
  })

  it('el menú de la tarjeta mueve a otra columna sin pedir resultado y lo confirma', async () => {
    vi.mocked(moveApplicationToStage).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderBoard()

    await user.click(screen.getByRole('button', { name: 'Acciones de Ana Mora' }))
    const menu = screen.getByRole('dialog')
    // La columna donde ya está no es un destino.
    expect(within(menu).getByRole('button', { name: /Recibido/ })).toBeDisabled()
    await user.click(within(menu).getByRole('button', { name: 'Entrevista' }))

    expect(moveApplicationToStage).toHaveBeenCalledWith({ applicationId: 1, stageId: 20 })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Ana Mora pasó a Entrevista.'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('si el servidor rechaza el movimiento, avisa con su mensaje', async () => {
    vi.mocked(moveApplicationToStage).mockResolvedValue({
      ok: false,
      error: 'Esa columna ya no existe. Recargue el tablero.',
    })
    const user = userEvent.setup()
    renderBoard()

    await user.click(screen.getByRole('button', { name: 'Acciones de Ana Mora' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Entrevista' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Esa columna ya no existe. Recargue el tablero.')
    )
    expect(toast.success).not.toHaveBeenCalled()
    // La tarjeta vuelve a su columna cuando termina la transición.
    await waitFor(() =>
      expect(within(column(/^Recibido/)).getByText('Ana Mora')).toBeInTheDocument()
    )
  })

  it('el menú ofrece contratar (va al alta) y descartar (pide el motivo)', async () => {
    const user = userEvent.setup()
    renderBoard()

    await user.click(screen.getByRole('button', { name: 'Acciones de Carla Soto' }))
    const menu = screen.getByRole('dialog')
    expect(within(menu).getByRole('link', { name: /Contratar/ })).toHaveAttribute(
      'href',
      '/recruitment/candidates/103/hire?postulacionId=3'
    )
    await user.click(within(menu).getByRole('button', { name: /Descartar/ }))

    expect(screen.getByRole('dialog', { name: 'Descartar a Carla Soto' })).toBeInTheDocument()
  })

  it('sin permiso de escritura es de solo lectura: ni menú ni alta', () => {
    renderBoard({ canWrite: false, canManageStages: false })

    expect(screen.queryByRole('button', { name: /^Acciones de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nuevo candidato/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/arrastrá una tarjeta/)).not.toBeInTheDocument()
    // Las tarjetas siguen abriendo la ficha.
    expect(within(column(/^Entrevista/)).getByRole('link')).toHaveAttribute(
      'href',
      '/recruitment/candidates/103'
    )
  })

  it('las columnas se administran en el tablero solo con CATALOGOS_WRITE', async () => {
    const user = userEvent.setup()
    renderBoard()

    expect(screen.getByRole('button', { name: 'Reordenar la columna Recibido' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Editar la columna Entrevista' }))
    const editar = screen.getByRole('dialog', { name: 'Editar columna: Entrevista' })
    expect(within(editar).getByLabelText('Nombre de la columna')).toHaveValue('Entrevista')
    // Tiene una candidata adentro: no se puede eliminar todavía.
    expect(within(editar).getByRole('button', { name: /Eliminar columna/ })).toBeDisabled()
    await user.click(within(editar).getByRole('button', { name: 'Cerrar' }))

    await user.click(screen.getByRole('button', { name: /Agregar columna/ }))
    expect(screen.getByRole('dialog', { name: 'Nueva columna' })).toBeInTheDocument()
  })

  it('quien no administra columnas no ve manijas, lápices ni "Agregar columna"', () => {
    renderBoard({ canManageStages: false })

    expect(screen.queryByRole('button', { name: /^Reordenar la columna/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Editar la columna/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Columna' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar columna/ })).not.toBeInTheDocument()
    // Pero sí mueve candidatos.
    expect(screen.getByRole('button', { name: 'Acciones de Ana Mora' })).toBeInTheDocument()
  })

  it('una columna se contrae a una franja que sigue diciendo su nombre y su conteo', async () => {
    const user = userEvent.setup()
    renderBoard({ canManageStages: false })

    // Contraer es una preferencia de vista: no pide permiso de columnas.
    await user.click(screen.getByRole('button', { name: 'Contraer la columna Recibido' }))

    const franja = screen.getByRole('button', {
      name: 'Expandir la columna Recibido (2 candidatos)',
    })
    expect(franja).toHaveAttribute('aria-expanded', 'false')
    // Las tarjetas no se ven, pero la columna sigue en el tablero.
    expect(screen.queryByText('Ana Mora')).not.toBeInTheDocument()
    expect(column(/^Recibido: 2 candidatos/)).toBeInTheDocument()

    await user.click(franja)
    expect(within(column(/^Recibido/)).getByText('Ana Mora')).toBeInTheDocument()
  })

  it('lo contraído se recuerda en este navegador al volver al tablero', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <RecruitmentBoard
        postulaciones={[ANA, BETO, CARLA]}
        stages={STAGES}
        tiposIdentificacion={[]}
        puestos={[]}
        sucursales={[]}
        canWrite
        canManageStages
      />
    )
    await user.click(screen.getByRole('button', { name: 'Contraer la columna Entrevista' }))
    unmount()

    renderBoard()

    expect(
      await screen.findByRole('button', { name: 'Expandir la columna Entrevista (1 candidato)' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contraer la columna Recibido' })).toBeInTheDocument()
  })

  it('"Contraer vacías" despeja las columnas sin candidatos y después ofrece expandir todo', async () => {
    const user = userEvent.setup()
    renderBoard()

    await user.click(screen.getByRole('button', { name: 'Contraer vacías' }))

    expect(
      screen.getByRole('button', { name: 'Expandir la columna Prueba práctica (0 candidatos)' })
    ).toBeInTheDocument()
    // Las que tienen candidatos quedan abiertas.
    expect(within(column(/^Recibido/)).getByText('Ana Mora')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contraer vacías' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expandir todas' }))
    expect(within(column(/^Prueba práctica/)).getByText('Sin candidatos')).toBeInTheDocument()
  })

  it('el índice lista las columnas con su conteo y abre la que estaba contraída', async () => {
    const user = userEvent.setup()
    renderBoard()

    const indice = screen.getByRole('navigation', { name: 'Ir a una columna' })
    expect(
      within(indice)
        .getAllByRole('button')
        .map((chip) => chip.getAttribute('aria-label'))
    ).toEqual([
      'Ir a Recibido: 2 candidatos',
      'Ir a Entrevista: 1 candidato',
      'Ir a Prueba práctica: 0 candidatos',
    ])

    await user.click(screen.getByRole('button', { name: 'Contraer la columna Entrevista' }))
    await user.click(within(indice).getByRole('button', { name: /^Ir a Entrevista/ }))

    expect(within(column(/^Entrevista/)).getByText('Carla Soto')).toBeInTheDocument()
  })

  it('tablero sin columnas: invita a crear la primera a quien puede', async () => {
    const user = userEvent.setup()
    renderBoard({ postulaciones: [], stages: [] })

    expect(screen.getByText('El tablero todavía no tiene columnas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Crear la primera columna/ }))
    expect(screen.getByRole('dialog', { name: 'Nueva columna' })).toBeInTheDocument()
  })

  it('tablero sin columnas y sin permiso: explica a quién pedirlas', () => {
    renderBoard({ postulaciones: [], stages: [], canManageStages: false })

    expect(screen.getByText(/Pedile a un administrador que las cree/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /columna/i })).not.toBeInTheDocument()
  })
})
