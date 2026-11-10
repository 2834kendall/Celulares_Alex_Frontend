import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BranchMetrics } from './BranchMetrics'
import type { CollaboratorRow, EvaluationDetail } from '../types'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/evaluations',
  useSearchParams: () => new URLSearchParams('periodo=noviembre&tab=metricas'),
}))
const evaluation = (score: number | null): EvaluationDetail => ({
  id: 10,
  fecha: '2026-11-01',
  periodo: 'Mensual',
  tipo: 'Mensual',
  promedio: score,
  resultado: null,
  evaluador: null,
  scores: { 11: 8 },
  observations: {},
  notes: { fortalezas: [], mejoras: [], comentarios: '' },
})
const person = (id: number, score: number | null | 'pending', branchId = 1): CollaboratorRow => ({
  labId: id,
  empId: id,
  fullName: `Persona ${id}`,
  idNumber: String(id),
  position: null,
  branchId,
  branchName: branchId === 1 ? 'Central' : 'Norte',
  fotoUrl: null,
  evaluation: score === 'pending' ? null : evaluation(score),
  history: [],
})
const branches = [
  { id: 1, name: 'Central' },
  { id: 2, name: 'Norte' },
]
const rubros = [
  { areaId: 1, criterioId: 11, nombre: 'Servicio', descripcion: 'Atención', activo: true },
]
const collaborators = [
  person(1, 9),
  person(2, 4),
  person(3, 'pending'),
  person(4, 7, 2),
  person(5, null, 2),
]
const metric = (name: RegExp) => screen.getByRole('button', { name })
async function filter(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Buscar sucursal' }))
  await user.click(screen.getByRole('button', { name }))
}
beforeEach(() => vi.clearAllMocks())

describe('branch evaluation metrics', () => {
  it('excludes missing scores from the average and evaluated count', () => {
    render(<BranchMetrics {...{ collaborators, branches, rubros }} />)
    expect(metric(/Promedio de la sucursal/)).toHaveTextContent('7/10')
    expect(metric(/Índice evaluación/)).toHaveTextContent('60%')
    expect(metric(/Índice evaluación/)).toHaveTextContent('3 de 5')
    expect(metric(/Bajo rendimiento-plan/)).toHaveTextContent('1 Crítico')
  })
  it('filters table, best score and coverage by branch and can restore all branches', async () => {
    render(<BranchMetrics {...{ collaborators, branches, rubros }} />)
    await filter('Norte')
    expect(screen.queryByText('Persona 1')).not.toBeInTheDocument()
    expect(metric(/Índice evaluación/)).toHaveTextContent('50%')
    expect(metric(/Mejor calificado/)).toHaveTextContent('Persona 4')
    expect(metric(/Bajo rendimiento-plan/)).toHaveTextContent('Sin casos')
    await filter('Todas las sucursales')
    expect(screen.getAllByText('Persona 1').length).toBeGreaterThan(0)
    expect(metric(/Índice evaluación/)).toHaveTextContent('60%')
  })
  it('navigates from the best-rated person while preserving unrelated filters', async () => {
    render(<BranchMetrics {...{ collaborators, branches, rubros }} />)
    await userEvent.click(metric(/Mejor calificado/))
    expect(push).toHaveBeenCalledExactlyOnceWith(
      '/evaluations?periodo=noviembre&tab=individual&colaborador=1'
    )
  })
  it('opens only people without an evaluation in the pending modal and navigates from it', async () => {
    render(<BranchMetrics {...{ collaborators, branches, rubros }} />)
    await userEvent.click(metric(/Índice evaluación/))
    const modal = within(
      screen.getByRole('dialog', { name: 'Colaboradores pendientes de evaluar' })
    )
    expect(modal.getByText('Persona 3')).toBeInTheDocument()
    expect(modal.queryByText('Persona 5')).not.toBeInTheDocument()
    await userEvent.click(modal.getByRole('button', { name: /Persona 3/ }))
    expect(push).toHaveBeenCalledWith('/evaluations?periodo=noviembre&tab=individual&colaborador=3')
  })
  it('orders low performers by score and excludes the threshold itself', async () => {
    render(
      <BranchMetrics
        collaborators={[person(1, 6), person(2, 2), person(3, 7)]}
        branches={branches}
        rubros={rubros}
      />
    )
    await userEvent.click(metric(/Bajo rendimiento-plan/))
    const modal = within(screen.getByRole('dialog', { name: 'Plan de bajo rendimiento' }))
    expect(
      modal.getAllByRole('listitem').map((node) => within(node).getByText(/Persona/).textContent)
    ).toEqual(['Persona 2', 'Persona 1'])
    expect(modal.queryByText('Persona 3')).not.toBeInTheDocument()
    await userEvent.click(modal.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('keeps the branch comparison global while a local branch filter is active', async () => {
    render(<BranchMetrics {...{ collaborators, branches, rubros }} />)
    await filter('Norte')
    await userEvent.click(metric(/Promedio de la sucursal/))
    const modal = within(screen.getByRole('dialog', { name: 'Promedio por sucursal' }))
    const rows = modal.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Central')
    expect(rows[0]).toHaveTextContent('3 colaboradores en planilla')
    expect(rows[1]).toHaveTextContent('Norte')
    expect(rows[1]).toHaveTextContent('2 colaboradores en planilla')
  })
  it('toggles the comparative chart and shows only scored evaluations', async () => {
    render(<BranchMetrics {...{ collaborators, branches, rubros }} />)
    const toggle = metric(/Gráfico comparativo/)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    const chart = within(document.getElementById('comparative-chart-panel')!)
    expect(chart.getByText('Persona 1')).toBeInTheDocument()
    expect(chart.queryByText('Persona 3')).not.toBeInTheDocument()
    expect(chart.queryByText('Persona 5')).not.toBeInTheDocument()
    await userEvent.click(toggle)
    expect(document.getElementById('comparative-chart-panel')).toBeNull()
  })
  it('shows safe empty metrics and disables best-person navigation', async () => {
    render(<BranchMetrics collaborators={[]} branches={branches} rubros={rubros} />)
    expect(metric(/Mejor calificado/)).toBeDisabled()
    expect(metric(/Índice evaluación/)).toHaveTextContent('0%')
    await userEvent.click(metric(/Gráfico comparativo/))
    expect(
      screen.getByText('Aún no hay colaboradores evaluados para comparar en esta sucursal.')
    ).toBeInTheDocument()
    await userEvent.click(metric(/Bajo rendimiento-plan/))
    expect(
      screen.getByText('Ningún colaborador se encuentra bajo el umbral de rendimiento.')
    ).toBeInTheDocument()
  })
  it('opens the selected table row once from its action button', async () => {
    render(
      <BranchMetrics collaborators={[person(8, 'pending')]} branches={branches} rubros={rubros} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ver evaluaciones' }))
    expect(push).toHaveBeenCalledExactlyOnceWith(
      '/evaluations?periodo=noviembre&tab=individual&colaborador=8'
    )
  })
})
