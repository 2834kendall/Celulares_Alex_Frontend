import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { AttendanceWidget } from './AttendanceWidget'
import type { AttendanceSummary } from '../lib/summaries'

const summary = (patch: Partial<AttendanceSummary> = {}): AttendanceSummary => ({
  expected: 10,
  onTime: 4,
  late: 2,
  missing: 1,
  pending: 2,
  justified: 1,
  working: 5,
  left: 1,
  latePeople: [],
  missingPeople: [],
  pendingPeople: [],
  ...patch,
})
beforeEach(() =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true }))
  )
)
afterEach(() => vi.unstubAllGlobals())
describe('daily attendance dashboard', () => {
  it('explains a day without shifts and avoids meaningless percentages', () => {
    render(<AttendanceWidget summary={summary({ expected: 0 })} />)
    expect(screen.getByText('Nadie tiene turno programado para hoy.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir Asistencia de hoy' })).toHaveAttribute(
      'href',
      '/attendance'
    )
  })
  it('labels every attendance bucket and computes percentages against expected people', () => {
    render(<AttendanceWidget summary={summary()} />)
    expect(
      screen.getByRole('img', {
        name: 'A tiempo: 4, Tardía: 2, Sin marcar: 1, Por llegar: 2, Justificada: 1',
      })
    ).toBeInTheDocument()
    expect(within(screen.getByText('A tiempo').closest('li')!).getByText('40%')).toBeInTheDocument()
    expect(within(screen.getByText('Tardía').closest('li')!).getByText('20%')).toBeInTheDocument()
    expect(screen.getByText('En jornada').nextElementSibling).toHaveTextContent('5')
    expect(screen.getByText('Ya salieron').nextElementSibling).toHaveTextContent('1')
  })
  it('omits zero-valued chart segments without dropping their named summary tiles', () => {
    render(
      <AttendanceWidget
        summary={summary({ onTime: 10, late: 0, missing: 0, pending: 0, justified: 0 })}
      />
    )
    const chart = screen.getByRole('img', { name: 'A tiempo: 10' })
    expect(chart.children).toHaveLength(1)
    expect(within(screen.getByText('Tardía').closest('li')!).getByText('0%')).toBeInTheDocument()
  })
  it('keeps justified tardiness explicitly labeled alongside the company catalog name', () => {
    render(
      <AttendanceWidget
        summary={summary({
          latePeople: [
            {
              id: 1,
              nombre: 'Ana Prueba',
              fotoUrl: null,
              minutes: 15,
              tipo: { nombre: 'Tardía leve', color: null },
              isJustified: true,
            },
          ],
        })}
      />
    )
    const person = screen.getByText('Ana Prueba').closest('li')!
    expect(person).toHaveTextContent('Tardía leve')
    expect(person).toHaveTextContent('justificada')
    expect(screen.getByRole('heading', { name: 'Llegaron tarde' })).toBeInTheDocument()
  })
  it('distinguishes missing employees from those whose shift has not started', () => {
    render(
      <AttendanceWidget
        summary={summary({
          missingPeople: [
            {
              id: 1,
              nombre: 'Ana Prueba',
              fotoUrl: null,
              minutes: 30,
              expectedStart: '08:00',
              tipo: { nombre: 'Tardía grave', color: '#ff0000' },
            },
          ],
          pendingPeople: [{ id: 2, nombre: 'Luis Prueba', fotoUrl: null, expectedStart: '13:00' }],
        })}
      />
    )
    expect(screen.getByText('Ana Prueba').closest('li')).toHaveTextContent('de atraso')
    expect(screen.getByText('Luis Prueba').closest('li')).toHaveTextContent('Entra a las')
    expect(screen.getByText('Luis Prueba').closest('li')).not.toHaveTextContent('de atraso')
  })
  it('limits each people list to four and reports the remaining headcount', () => {
    render(
      <AttendanceWidget
        summary={summary({
          pendingPeople: Array.from({ length: 6 }, (_, i) => ({
            id: i,
            nombre: `Persona ${i}`,
            fotoUrl: null,
            expectedStart: '13:00',
          })),
        })}
      />
    )
    expect(screen.getByText('Persona 3')).toBeInTheDocument()
    expect(screen.queryByText('Persona 4')).not.toBeInTheDocument()
    expect(screen.getByText('y 2 más')).toBeInTheDocument()
  })
  it('highlights the same bucket from both its segment and its summary tile', () => {
    render(<AttendanceWidget summary={summary()} />)
    const chart = screen.getByRole('img')
    const segment = within(chart).getByTitle('Tardía: 2')
    const tile = screen.getByText('Tardía').closest('li')!
    fireEvent.pointerEnter(segment)
    expect(tile).toHaveClass('bg-slate-50')
    fireEvent.pointerLeave(segment)
    expect(tile).not.toHaveClass('bg-slate-50')
    fireEvent.pointerEnter(tile)
    expect(segment).toHaveClass('scale-y-125')
    fireEvent.pointerLeave(tile)
    expect(segment).not.toHaveClass('scale-y-125')
  })
})
