import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IndividualView } from './IndividualView'
import { EvaluationHistory } from './EvaluationHistory'
import { NewEvaluationSection } from './NewEvaluationSection'
import { UnsavedChangesProvider } from '@/components/ui/UnsavedChangesProvider'
import type { CollaboratorRow, EvaluationDetail } from '../types'

vi.mock('../actions/updateEvaluationNotes', () => ({ updateEvaluationNotes: vi.fn() }))
vi.mock('../actions/createEvaluation', () => ({ createEvaluation: vi.fn() }))
vi.mock('nextjs-nav-guard', () => ({
  NavigationGuardProvider: ({ children }: { children: React.ReactNode }) => children,
  useNavigationGuard: vi.fn(),
}))

const { push, replace, query } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  query: { value: 'tab=individual&colaborador=2&branch=3' },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/evaluations',
  useSearchParams: () => new URLSearchParams(query.value),
}))
const detail = (id: number, score: number | null = 8): EvaluationDetail => ({
  id,
  fecha: `2026-11-${String(id).padStart(2, '0')}`,
  periodo: `Período ${id}`,
  tipo: 'Mensual',
  promedio: score,
  resultado: 'Bueno',
  evaluador: 'Encargado',
  scores: { 11: 8 },
  observations: { 11: 'Observación por criterio' },
  notes: {
    fortalezas: ['Buen servicio'],
    mejoras: ['Orden'],
    comentarios: 'Comentario confirmado',
  },
})
const person = (id: number, evaluation: EvaluationDetail | null = detail(id)): CollaboratorRow => ({
  labId: id,
  empId: id,
  fullName: `Persona ${id}`,
  idNumber: `100${id}`,
  position: null,
  branchId: 3,
  branchName: 'Central',
  fotoUrl: null,
  evaluation,
  history: evaluation ? [evaluation] : [],
})
const rubros = [
  { areaId: 1, criterioId: 11, nombre: 'Servicio', descripcion: 'Atención', activo: true },
  { areaId: 2, criterioId: null, nombre: 'Legado', descripcion: 'Sin criterio', activo: true },
  { areaId: 3, criterioId: 13, nombre: 'Sin nota', descripcion: 'No aplica', activo: true },
]
beforeEach(() => {
  vi.clearAllMocks()
  query.value = 'tab=individual&colaborador=2&branch=3'
})

describe('individual evaluation record', () => {
  it('explains the empty active roster', () => {
    render(<IndividualView collaborators={[]} rubros={rubros} canWrite={false} />)
    expect(screen.getByText('No hay colaboradores activos')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
  it('selects only an available collaborator from the URL and falls back safely', () => {
    const view = render(
      <IndividualView collaborators={[person(1), person(2)]} rubros={rubros} canWrite={false} />
    )
    expect(screen.getByRole('combobox')).toHaveValue('Persona 2')
    expect(screen.queryByText('Persona 1')).not.toBeInTheDocument()
    query.value = 'colaborador=999'
    view.rerender(
      <IndividualView collaborators={[person(1), person(2)]} rubros={rubros} canWrite={false} />
    )
    expect(screen.getByRole('combobox')).toHaveValue('Persona 1')
  })
  it('changes collaborators by identity search and preserves filters without scrolling', async () => {
    render(
      <IndividualView collaborators={[person(1), person(2)]} rubros={rubros} canWrite={false} />
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), '1001')
    await user.click(screen.getByRole('button', { name: /Persona 1/ }))
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      '/evaluations?tab=individual&colaborador=1&branch=3',
      { scroll: false }
    )
  })
  it.each([false, true])(
    'gates the first-evaluation action by write permission %s',
    async (canWrite) => {
      render(
        <IndividualView collaborators={[person(2, null)]} rubros={rubros} canWrite={canWrite} />
      )
      expect(screen.getByText('Este colaborador aún no tiene evaluaciones')).toBeInTheDocument()
      if (canWrite) {
        await userEvent.click(
          screen.getByRole('button', { name: 'Realizar evaluación a Persona 2' })
        )
        expect(push).toHaveBeenCalledWith('/evaluations?tab=nueva&colaborador=2&branch=3')
      } else
        expect(
          screen.queryByRole('button', { name: /Realizar evaluación/ })
        ).not.toBeInTheDocument()
    }
  )
  it('renders persisted notes, criterion observations and safe legacy/missing scores', () => {
    render(<IndividualView collaborators={[person(2)]} rubros={rubros} canWrite={false} />)
    expect(screen.getByText('Buen servicio')).toBeInTheDocument()
    expect(screen.getByText('Orden')).toBeInTheDocument()
    expect(screen.getByText(/Comentario confirmado/)).toBeInTheDocument()
    expect(screen.getByText('Observación por criterio')).toBeInTheDocument()
    expect(screen.getByText('Legado')).toBeInTheDocument()
    expect(screen.getByText('Sin nota')).toBeInTheDocument()
    expect(screen.queryByText(/NaN|undefined/)).not.toBeInTheDocument()
  })
  it.each([false, true])('gates adding absent notes by write permission %s', async (canWrite) => {
    const evaluation = { ...detail(2), notes: { fortalezas: [], mejoras: [], comentarios: '' } }
    render(
      <IndividualView collaborators={[person(2, evaluation)]} rubros={rubros} canWrite={canWrite} />
    )
    if (canWrite) {
      await userEvent.click(screen.getByRole('button', { name: 'Agregar comentarios' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' })
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } else expect(screen.queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument()
  })
  it('paginates the rubric list without losing the selected collaborator', async () => {
    render(
      <IndividualView
        collaborators={[person(2)]}
        rubros={Array.from({ length: 9 }, (_, i) => ({
          ...rubros[0],
          areaId: i,
          nombre: `Rubro ${i}`,
        }))}
        canWrite={false}
      />
    )
    expect(screen.queryByText('Rubro 8')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getByText('Rubro 8')).toBeInTheDocument()
    expect(screen.queryByText('Rubro 0')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('Persona 2')
  })
})

describe('evaluation history and read-only detail', () => {
  it('renders no history section for a person without history', () => {
    const { container } = render(
      <EvaluationHistory collaborator={person(2, null)} rubros={rubros} />
    )
    expect(container).toBeEmptyDOMElement()
  })
  it.each([
    [9, 6, '+3'],
    [4, 8, '-4'],
    [8, 8, '0'],
  ] as const)('compares consecutive scores %s/%s', (current, previous, trend) => {
    render(
      <EvaluationHistory
        collaborator={{ ...person(2), history: [detail(2, current), detail(1, previous)] }}
        rubros={rubros}
      />
    )
    const cards = screen.getAllByRole('listitem')
    expect(within(cards[0]).getByText(trend)).toBeInTheDocument()
    expect(cards[0]).toHaveTextContent('Vigente')
    expect(cards[1]).not.toHaveTextContent('Vigente')
  })
  it('does not manufacture a trend from a missing score', () => {
    render(
      <EvaluationHistory
        collaborator={{ ...person(2), history: [detail(2, null), detail(1, 8)] }}
        rubros={rubros}
      />
    )
    expect(screen.getAllByRole('listitem')[0]).not.toHaveTextContent('+8')
    expect(screen.getAllByRole('listitem')[0]).not.toHaveTextContent('-8')
  })
  it('opens the exact historical evaluation from a mobile card with notes and observations', async () => {
    render(
      <EvaluationHistory
        collaborator={{ ...person(2), history: [detail(2), detail(1)] }}
        rubros={rubros}
      />
    )
    await userEvent.click(within(screen.getAllByRole('listitem')[1]).getByRole('button'))
    const modal = within(screen.getByRole('dialog', { name: 'Evaluación de Persona 2' }))
    expect(modal.getByText('Período 1')).toBeInTheDocument()
    expect(modal.getByText('Buen servicio')).toBeInTheDocument()
    expect(modal.getByText('Observación por criterio')).toBeInTheDocument()
    expect(modal.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    await userEvent.click(modal.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('opens a desktop row and suppresses absent qualitative sections', () => {
    const evaluation = {
      ...detail(2),
      evaluador: null,
      resultado: null,
      notes: { fortalezas: [], mejoras: [], comentarios: '' },
    }
    render(
      <EvaluationHistory collaborator={{ ...person(2), history: [evaluation] }} rubros={rubros} />
    )
    fireEvent.click(screen.getAllByRole('row')[1])
    const modal = within(screen.getByRole('dialog'))
    expect(modal.queryByText('Puntos fuertes detectados')).not.toBeInTheDocument()
    expect(modal.queryByText('Aspectos a mejorar')).not.toBeInTheDocument()
    expect(modal.queryByText('Comentarios de liderazgo')).not.toBeInTheDocument()
  })
  it('uses the next evaluation across page boundaries to calculate history trends', async () => {
    const history = Array.from({ length: 9 }, (_, i) =>
      detail(i + 1, i === 7 ? 9 : i === 8 ? 2 : 8)
    )
    render(<EvaluationHistory collaborator={{ ...person(2), history }} rubros={rubros} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(within(screen.getAllByRole('listitem')[7]).getByText('+7')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('2026-11-09')
    expect(screen.queryByText('Vigente')).not.toBeInTheDocument()
  })
})

describe('new evaluation section', () => {
  it('keeps an edited evaluation open until the user explicitly discards it', async () => {
    render(
      <UnsavedChangesProvider>
        <NewEvaluationSection collaborators={[person(2)]} rubros={rubros} />
      </UnsavedChangesProvider>
    )
    await userEvent.type(screen.getByLabelText('Comentarios de liderazgo'), 'Borrador importante')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(screen.getByLabelText('Comentarios de liderazgo')).toHaveValue('Borrador importante')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    expect(screen.queryByRole('button', { name: 'Guardar evaluación' })).not.toBeInTheDocument()
  })

  it('opens the form only for an authorized collaborator deep link', () => {
    const view = render(<NewEvaluationSection collaborators={[person(2)]} rubros={rubros} />)
    expect(screen.getByRole('button', { name: 'Guardar evaluación' })).toBeInTheDocument()
    view.unmount()
    query.value = 'colaborador=999'
    render(<NewEvaluationSection collaborators={[person(2)]} rubros={rubros} />)
    expect(screen.queryByRole('button', { name: 'Guardar evaluación' })).not.toBeInTheDocument()
  })
  it('toggles form visibility and explains an empty recent history', async () => {
    query.value = ''
    render(<NewEvaluationSection collaborators={[person(2, null)]} rubros={rubros} />)
    expect(
      screen.getByText('Todavía no se ha registrado ninguna evaluación de desempeño.')
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Realizar evaluación a colaborador' }))
    expect(screen.getByRole('button', { name: 'Guardar evaluación' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('button', { name: 'Guardar evaluación' })).not.toBeInTheDocument()
  })
  it('sorts recent evaluations by date and navigates from a card', async () => {
    query.value = 'branch=3'
    render(
      <NewEvaluationSection
        collaborators={[person(1), person(2), person(3, null)]}
        rubros={rubros}
      />
    )
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('Persona 2')
    await userEvent.click(within(cards[0]).getByRole('button'))
    expect(push).toHaveBeenCalledWith('/evaluations?branch=3&tab=individual&colaborador=2')
  })
})
