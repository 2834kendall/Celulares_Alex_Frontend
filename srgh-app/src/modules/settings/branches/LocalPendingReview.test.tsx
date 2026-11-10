import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LocalPendingReview } from './LocalPendingReview'
import {
  getQueuedMarks,
  getDiscardedMarks,
} from '@/modules/attendance/components/kiosk/offlineQueue'
vi.mock('@/modules/attendance/components/kiosk/offlineQueue', () => ({
  getQueuedMarks: vi.fn(),
  getDiscardedMarks: vi.fn(),
}))
describe('read-only local review', () => {
  it('shows own-company drafts but redacts old and other-company context without deleting or replaying anything', async () => {
    const draft = {
      id: 'own',
      employeeId: 7,
      tipo: 'entrada' as const,
      fechaHora: '2026-11-06 08:00:00',
      latitud: null,
      longitud: null,
      dispositivoId: null,
      ticketFacial: `7.999.${btoa('1:10:kiosk:1')}.proof`,
    }
    vi.mocked(getQueuedMarks).mockResolvedValue([
      draft,
      {
        ...draft,
        id: 'foreign',
        employeeId: 99,
        ticketFacial: `99.999.${btoa('2:20:other:1')}.proof`,
      },
      { ...draft, id: 'old', employeeId: 88, ticketFacial: '88.999.proof' },
    ])
    vi.mocked(getDiscardedMarks).mockResolvedValue([])
    render(<LocalPendingReview empresaId={1} />)
    expect(await screen.findByText(/Colaborador #7/)).toBeInTheDocument()
    expect(screen.queryByText(/Colaborador #99/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Colaborador #88/)).not.toBeInTheDocument()
    expect(await screen.findByText(/1 pendientes antiguos/)).toBeInTheDocument()
    expect(screen.queryByText(/\.proof/)).not.toBeInTheDocument()
  })
})
