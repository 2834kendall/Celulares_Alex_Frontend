import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DayStatusKind } from '@/modules/attendance/lib/dayStatus'
import { DayStatusBadge } from './DayStatusBadge'

const states = [
  ['sin_marcar', 'Sin marcar', 'circle-x', 'bg-rose-50'],
  ['sin_salida', 'Sin salida', 'log-out', 'bg-orange-50'],
  ['en_jornada', 'En jornada', 'log-in', 'bg-emerald-50'],
  ['ya_salio', 'Ya salió', 'circle-check', 'bg-slate-100'],
  ['por_llegar', 'Por llegar', 'hourglass', 'bg-slate-100'],
  ['justificada', 'Justificada', 'file-check', 'bg-brand-50'],
  ['libre', 'Libre', 'calendar-off', 'bg-slate-100'],
  ['sin_programacion', 'Sin horario', 'calendar-minus', 'bg-slate-100'],
] satisfies [DayStatusKind, string, string, string][]

describe('DayStatusBadge', () => {
  it.each(states)('shows %s with its label, icon and tone', (kind, label, icon, tone) => {
    render(<DayStatusBadge status={{ kind, tardiness: null, needsAttention: false }} size="xs" />)

    const badge = screen.getByText(label)
    expect(badge).toHaveClass(tone, 'text-[10px]')
    expect(badge.querySelector(`.lucide-${icon}`)).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows Feriado for a holiday with libre status', () => {
    render(
      <DayStatusBadge
        status={{ kind: 'libre', tardiness: null, needsAttention: false }}
        isHoliday
      />
    )
    expect(screen.getByText('Feriado')).toBeInTheDocument()
  })

  it('shows the lateness type and minutes with the configured color', () => {
    render(
      <DayStatusBadge
        status={{
          kind: 'en_jornada',
          tardiness: { nombre: 'Tardía leve', color: '#E11D48', minutes: 12, isJustified: false },
          needsAttention: true,
        }}
      />
    )

    const chip = screen.getByText('Tardía leve · +12 min')
    expect(chip.style.backgroundColor).not.toBe('')
    expect(chip.style.color).not.toBe('')
  })

  it('labels and tones down justified lateness', () => {
    render(
      <DayStatusBadge
        status={{
          kind: 'ya_salio',
          tardiness: { nombre: 'Tardía leve', color: '#E11D48', minutes: 12, isJustified: true },
          needsAttention: false,
        }}
      />
    )

    expect(screen.getByText('Tardía leve · +12 min · justificada')).toHaveClass(
      'bg-slate-100',
      'text-slate-500'
    )
  })
})
