import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { DndContext, DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { RecruitmentBoard } from './RecruitmentBoard'
import { moveApplicationToStage } from '../actions/moveApplicationToStage'
import { reorderSelectionStages } from '../actions/reorderSelectionStages'
import { resetBoardTab } from '../hooks/useBoardTab'
import type { PostulacionBoardItem } from '../actions/getPostulacionesBoard'

const { push, drag } = vi.hoisted(() => ({
  push: vi.fn(),
  drag: { props: null as ComponentProps<typeof DndContext> | null },
}))
// Keep actual DnD components; supply resolved drop events at the library boundary.
// These tests cover dispatch/optimistic rollback, not pointer hit testing.
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof DndContext>) => {
      drag.props = props
      return <actual.DndContext {...props} />
    },
  }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../actions/moveApplicationToStage', () => ({ moveApplicationToStage: vi.fn() }))
vi.mock('../actions/reorderSelectionStages', () => ({ reorderSelectionStages: vi.fn() }))
vi.mock('../actions/rejectPostulacion', () => ({ rejectPostulacion: vi.fn() }))
vi.mock('../actions/createEtapaSeleccion', () => ({ createEtapaSeleccion: vi.fn() }))
vi.mock('../actions/updateEtapaSeleccion', () => ({ updateEtapaSeleccion: vi.fn() }))
vi.mock('../actions/deleteEtapaSeleccion', () => ({ deleteEtapaSeleccion: vi.fn() }))
vi.mock('./NuevoCandidatoForm', () => ({ NuevoCandidatoForm: () => null }))
const stages = [
  { id: 10, nombre: 'Recibido', orden: 0, color: null },
  { id: 20, nombre: 'Entrevista', orden: 1, color: null },
  { id: 30, nombre: 'Prueba', orden: 2, color: null },
]
const application: PostulacionBoardItem = {
  posId: 1,
  candidatoId: 101,
  candidatoNombre: 'Ana Prueba',
  puestoNombre: 'Ventas',
  sucursalNombre: 'Central',
  fechaPostula: '2026-11-01',
  puntajePromedio: null,
  etapaId: 10,
  etapaNombre: 'Recibido',
  etapaColor: null,
}
const card = { type: 'card', application }
const column = (i: number) => ({ type: 'column', stage: stages[i] })
function renderBoard() {
  render(
    <RecruitmentBoard
      postulaciones={[application]}
      stages={stages}
      tiposIdentificacion={[]}
      puestos={[]}
      sucursales={[]}
      canWrite
      canManageStages
    />
  )
}
function drop(source: unknown, target: unknown) {
  act(() =>
    drag.props!.onDragEnd!({
      active: { data: { current: source } },
      over: target ? { data: { current: target } } : null,
    } as DragEndEvent)
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false }))
  )
  window.localStorage.clear()
  resetBoardTab()
  vi.mocked(moveApplicationToStage).mockResolvedValue({ ok: true })
  vi.mocked(reorderSelectionStages).mockResolvedValue({ ok: true })
})
afterEach(() => vi.unstubAllGlobals())

describe('recruitment resolved drag operations', () => {
  it.each([
    [undefined, column(1)],
    [card, null],
    [column(0), column(0)],
  ])('ignores absent targets/data and drops on the same column', (source, target) => {
    renderBoard()
    drop(source, target)
    expect(moveApplicationToStage).not.toHaveBeenCalled()
    expect(reorderSelectionStages).not.toHaveBeenCalled()
  })
  it('does not submit a card already in its target stage', () => {
    renderBoard()
    drop(card, column(0))
    expect(moveApplicationToStage).not.toHaveBeenCalled()
  })
  it('moves a card to the resolved stage without a redundant success toast', async () => {
    renderBoard()
    drop(card, column(1))
    await waitFor(() =>
      expect(moveApplicationToStage).toHaveBeenCalledExactlyOnceWith({
        applicationId: 1,
        stageId: 20,
      })
    )
    expect(toast.success).not.toHaveBeenCalled()
  })
  it('opens hiring with the exact candidate and application instead of changing stage', () => {
    renderBoard()
    drop(card, { type: 'zone', zone: 'hire' })
    expect(push).toHaveBeenCalledExactlyOnceWith('/recruitment/candidates/101/hire?postulacionId=1')
    expect(moveApplicationToStage).not.toHaveBeenCalled()
  })
  it('opens a discard confirmation without discarding on drop', () => {
    renderBoard()
    drop(card, { type: 'zone', zone: 'discard' })
    expect(screen.getByRole('dialog', { name: 'Descartar a Ana Prueba' })).toBeInTheDocument()
    expect(moveApplicationToStage).not.toHaveBeenCalled()
  })
  it('reorders the complete column list without moving applications', async () => {
    renderBoard()
    drop(column(0), column(2))
    await waitFor(() =>
      expect(reorderSelectionStages).toHaveBeenCalledExactlyOnceWith([20, 30, 10])
    )
    expect(moveApplicationToStage).not.toHaveBeenCalled()
  })
  it('does not treat a column dropped on a hiring zone as an application', () => {
    renderBoard()
    drop(column(0), { type: 'zone', zone: 'hire' })
    expect(push).not.toHaveBeenCalled()
    expect(reorderSelectionStages).not.toHaveBeenCalled()
  })
  it('reports a rejected reorder and restores the original column order', async () => {
    vi.mocked(reorderSelectionStages).mockResolvedValue({
      ok: false,
      error: 'Orden desactualizado.',
    })
    renderBoard()
    drop(column(0), column(2))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Orden desactualizado.'))
    await waitFor(() =>
      expect(screen.getAllByRole('region').map((node) => node.getAttribute('aria-label'))).toEqual([
        'Recibido: 1 candidato',
        'Entrevista: 0 candidatos',
        'Prueba: 0 candidatos',
      ])
    )
  })
  it('recovers a thrown movement request and leaves the card available for an explicit retry', async () => {
    vi.mocked(moveApplicationToStage).mockRejectedValueOnce(new Error('offline'))
    renderBoard()
    drop(card, column(1))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'No se pudo confirmar el movimiento. Revisá el tablero antes de reintentar.'
      )
    )
    expect(
      within(screen.getByRole('region', { name: /^Recibido/ })).getByText('Ana Prueba')
    ).toBeInTheDocument()
    drop(card, column(1))
    await waitFor(() => expect(moveApplicationToStage).toHaveBeenCalledTimes(2))
  })
  it('recovers a thrown reorder without crashing the board', async () => {
    vi.mocked(reorderSelectionStages).mockRejectedValueOnce(new Error('offline'))
    renderBoard()
    drop(column(0), column(2))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'No se pudo confirmar el orden. Revisá el tablero antes de reintentar.'
      )
    )
    expect(screen.getAllByRole('region')).toHaveLength(3)
    drop(column(0), column(2))
    await waitFor(() => expect(reorderSelectionStages).toHaveBeenCalledTimes(2))
  })
})
