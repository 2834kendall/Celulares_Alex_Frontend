import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EvaluationForm } from './EvaluationForm'
import { createEvaluation } from '../actions/createEvaluation'
import type { CollaboratorRow, RubroRow } from '../types'
import { chooseSelectMenuOption } from '@/test/selectMenu'

const { push, acceptChanges } = vi.hoisted(() => ({ push: vi.fn(), acceptChanges: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/evaluations',
  useSearchParams: () => new URLSearchParams('sucursal=2&tab=nueva'),
}))
vi.mock('../actions/createEvaluation', () => ({ createEvaluation: vi.fn() }))
vi.mock('@/hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({ bindRoot: vi.fn(), acceptChanges }),
}))
// Date-picker mechanics have their own tests; this boundary supplies ISO values
// so these cases exercise the form's real schema and submission behavior.
vi.mock('@/components/ui/DatePickerButton', () => ({
  DateField: ({
    id,
    value,
    disabled,
    onChange,
  }: {
    id: string
    value: string
    disabled: boolean
    onChange: (value: string) => void
  }) => (
    <input
      id={id}
      type="date"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

const collaborators: CollaboratorRow[] = [
  {
    labId: 4,
    empId: 7,
    fullName: 'Ana Prueba',
    idNumber: '123',
    position: null,
    branchId: 2,
    branchName: 'Central',
    fotoUrl: null,
    evaluation: null,
    history: [],
  },
]
const rubros: RubroRow[] = [
  { areaId: 1, criterioId: 11, nombre: 'Puntualidad', descripcion: 'Horario', activo: true },
  { areaId: 2, criterioId: 12, nombre: 'Servicio', descripcion: 'Atención', activo: true },
  { areaId: 3, criterioId: null, nombre: 'Legado', descripcion: 'Sin criterio', activo: true },
]
const save = () => screen.getByRole('button', { name: 'Guardar evaluación' })
function dates(start = '2026-11-01', end = '2026-11-30') {
  fireEvent.change(screen.getByLabelText('Período evaluado — desde'), { target: { value: start } })
  fireEvent.change(screen.getByLabelText('Período evaluado — hasta'), { target: { value: end } })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createEvaluation).mockResolvedValue({ ok: true, id: 9 })
})

describe('evaluation creation form', () => {
  it('requires a scorable rubric and excludes legacy areas', () => {
    const view = render(<EvaluationForm collaborators={collaborators} rubros={[rubros[2]]} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No hay rubros')
    expect(screen.queryByRole('button', { name: 'Guardar evaluación' })).not.toBeInTheDocument()
    view.rerender(<EvaluationForm collaborators={collaborators} rubros={[]} />)
    expect(createEvaluation).not.toHaveBeenCalled()
  })
  it('does not accept an initial collaborator outside the authorized list', async () => {
    render(<EvaluationForm collaborators={collaborators} rubros={rubros} initialLabId={999} />)
    dates()
    await userEvent.click(save())
    expect(await screen.findByText('Seleccione un colaborador.')).toBeInTheDocument()
    expect(createEvaluation).not.toHaveBeenCalled()
  })
  it('rejects missing dates before making a request', async () => {
    render(<EvaluationForm collaborators={collaborators} rubros={rubros} initialLabId={4} />)
    await userEvent.click(save())
    expect(await screen.findByText('Seleccione la fecha de inicio.')).toBeInTheDocument()
    expect(createEvaluation).not.toHaveBeenCalled()
  })
  it('rejects a reversed period', async () => {
    render(<EvaluationForm collaborators={collaborators} rubros={rubros} initialLabId={4} />)
    dates('2026-11-30', '2026-11-01')
    await userEvent.click(save())
    expect(
      await screen.findByText('La fecha de fin debe ser posterior a la de inicio.')
    ).toBeInTheDocument()
    expect(createEvaluation).not.toHaveBeenCalled()
  })
  it('excludes nonapplicable scores from the average and rejects all nonapplicable rubrics', async () => {
    render(<EvaluationForm collaborators={collaborators} rubros={rubros} initialLabId={4} />)
    dates()
    fireEvent.change(screen.getByLabelText('Puntualidad'), { target: { value: '2' } })
    await userEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByLabelText('Puntualidad')).toBeDisabled()
    expect(screen.getByText(/^Promedio:/)).toHaveTextContent('8/10')
    await userEvent.click(screen.getAllByRole('checkbox')[1])
    await userEvent.click(save())
    expect(
      await screen.findByText('Debe calificar al menos un rubro que aplique.')
    ).toBeInTheDocument()
    expect(createEvaluation).not.toHaveBeenCalled()
  })
  it('submits selected identity/type, scores and notes, then preserves other URL filters', async () => {
    const success = vi.fn()
    render(<EvaluationForm collaborators={collaborators} rubros={rubros} onSuccess={success} />)
    const user = userEvent.setup()
    await chooseSelectMenuOption(user, 'Colaborador', 'Ana Prueba — Central')
    await chooseSelectMenuOption(user, 'Tipo de evaluación', 'Sorpresa')
    dates()
    fireEvent.change(screen.getByLabelText('Puntualidad'), { target: { value: '10' } })
    await user.type(screen.getAllByPlaceholderText('Observaciones (opcional)')[0], ' A tiempo ')
    await user.click(screen.getAllByRole('checkbox')[1])
    await user.type(
      screen.getByPlaceholderText('Ej: Compromiso con las guardias'),
      'Responsable{Enter}'
    )
    await user.type(screen.getByPlaceholderText('Ej: Orden'), 'Orden{Enter}')
    await user.type(screen.getByLabelText('Comentarios de liderazgo'), ' Buen trabajo ')
    await user.click(save())
    await waitFor(() => expect(success).toHaveBeenCalledOnce())
    expect(createEvaluation).toHaveBeenCalledExactlyOnceWith({
      labId: 4,
      tipo: 'Sorpresa',
      periodoInicio: '2026-11-01',
      periodoFin: '2026-11-30',
      scores: [
        { criterioId: 11, puntaje: 10, observacion: 'A tiempo', noAplica: false },
        { criterioId: 12, puntaje: null, observacion: '', noAplica: true },
      ],
      fortalezas: ['Responsable'],
      mejoras: ['Orden'],
      comentarios: 'Buen trabajo',
    })
    expect(push).toHaveBeenCalledWith('/evaluations?sucursal=2&tab=individual&colaborador=4')
    expect(acceptChanges).toHaveBeenCalled()
  })
  it('keeps edits and the unsaved guard after a server rejection', async () => {
    vi.mocked(createEvaluation).mockResolvedValue({ ok: false, error: 'No se pudo guardar.' })
    const success = vi.fn()
    render(
      <EvaluationForm
        collaborators={collaborators}
        rubros={rubros}
        initialLabId={4}
        onSuccess={success}
      />
    )
    dates()
    await userEvent.type(screen.getByLabelText('Comentarios de liderazgo'), 'Conservar')
    await userEvent.click(save())
    expect(await screen.findByText('No se pudo guardar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Comentarios de liderazgo')).toHaveValue('Conservar')
    expect(save()).toBeEnabled()
    expect(success).not.toHaveBeenCalled()
    expect(acceptChanges).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
  it('disables controls and submits only once while the request is pending', async () => {
    let finish!: (result: { ok: true; id: number }) => void
    vi.mocked(createEvaluation).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(<EvaluationForm collaborators={collaborators} rubros={rubros} initialLabId={4} />)
    dates()
    await userEvent.dblClick(save())
    expect(createEvaluation).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Registrando evaluación' })).toBeDisabled()
    expect(screen.getByLabelText('Comentarios de liderazgo')).toBeDisabled()
    await act(async () => finish({ ok: true, id: 9 }))
  })
  it('recovers from a thrown request without losing edits or accepting unsaved changes', async () => {
    vi.mocked(createEvaluation).mockRejectedValueOnce(new Error('offline'))
    render(<EvaluationForm collaborators={collaborators} rubros={rubros} initialLabId={4} />)
    dates()
    await userEvent.type(screen.getByLabelText('Comentarios de liderazgo'), 'Conservar')
    await userEvent.click(save())
    expect(
      await screen.findByText(
        'No se pudo confirmar el registro. Revisá las evaluaciones antes de reintentar.'
      )
    ).toBeInTheDocument()
    expect(save()).toBeEnabled()
    expect(screen.getByLabelText('Comentarios de liderazgo')).toHaveValue('Conservar')
    expect(acceptChanges).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    await userEvent.click(save())
    await waitFor(() => expect(push).toHaveBeenCalledOnce())
  })
})
